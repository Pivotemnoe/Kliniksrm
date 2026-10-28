import Foundation
import UIKit
import UserNotifications
import Observation

struct NativePushConfig: Decodable { let available: Bool; let provider: String; let applicationId: String?; let environment: String? }
struct NativePushDevice: Decodable { let id: String; let expiresAt: String }
struct NativePushEvent: Decodable { let eventId: String; let kind: String; let conversationEmployeeId: String?; let channelId: String? }
struct PushInstallation: Codable { let installationId: String; var deviceId: String?; var enabled: Bool }

@MainActor @Observable final class NativePushCoordinator {
    static let shared = NativePushCoordinator()
    var state = "Доставка на iPhone ещё не настроена"
    var available = false
    var registered = false
    var busy = false
    var error: String?
    var pendingEventId: String?
    var foregroundRevision = 0
    @ObservationIgnored private weak var app: AppStore?
    @ObservationIgnored private var installation: PushInstallation?
    @ObservationIgnored private var keychain: KeychainStore?
    @ObservationIgnored private var actorId: String?
    @ObservationIgnored private var seenEvents = Set<String>()
    func resume(_ app: AppStore) async {
        self.app = app
        guard let api = app.api, let actor = app.employee?.id, app.profile?.settings.enabled == true else { return }
        if actorId != actor { registered = false; actorId = actor; installation = nil }
        guard app.profile?.settings.notifications == true else { available = false; state = "Уведомления отключены для вас в CRM"; return }
        var parts = URLComponents(); parts.queryItems = [URLQueryItem(name: "platform", value: "IOS"), URLQueryItem(name: "applicationId", value: Bundle.main.bundleIdentifier ?? "")]
        do {
            let config: NativePushConfig = try await api.request("v1/staff-app/native-push/config?" + parts.percentEncodedQuery!)
            available = config.available && config.provider == "APNS" && config.applicationId == Bundle.main.bundleIdentifier
            if available && config.environment != (Bundle.main.object(forInfoDictionaryKey: "StaffAPNSEnvironment") as? String ?? "SANDBOX") { available = false; state = "Настройка уведомлений не подходит этой сборке. Обратитесь к администратору."; return }
            guard available else { registered = false; state = "Отправка уведомлений на iPhone ещё не настроена в клинике"; return }
            let key = KeychainStore(account: api.address.origin + ".native-push." + actor)
            keychain = key
            if let data = try key.read() { installation = try JSONDecoder().decode(PushInstallation.self, from: data) }
            if installation == nil { installation = PushInstallation(installationId: UUID().uuidString, deviceId: nil, enabled: false) }
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if installation?.enabled == true && [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) {
                state = "Проверяем регистрацию этого iPhone…"; UIApplication.shared.registerForRemoteNotifications()
            } else { state = settings.authorizationStatus == .denied ? "Разрешите уведомления в настройках iPhone" : "Можно включить уведомления на этом iPhone" }
        } catch {
            available = false; registered = false
            if case APIError.server(404, _) = error { state = "Уведомления на iPhone ещё не подключены клиникой" }
            else { state = "Не удалось проверить доставку на iPhone"; self.error = error.localizedDescription }
        }
    }
    func enable(_ app: AppStore) async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false }
        await resume(app)
        guard available, app.profile?.settings.notifications == true else { return }
        do {
            guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) else { state = "Уведомления не разрешены на iPhone"; return }
            installation?.enabled = true; try persist()
            state = "Подключаем уведомления…"
            UIApplication.shared.registerForRemoteNotifications()
        } catch { self.error = error.localizedDescription; state = "Не удалось подключить уведомления" }
    }
    func didRegister(_ token: Data) async {
        guard let app, let api = app.api, let actor = app.employee?.id, actor == actorId, app.profile?.settings.notifications == true, available, let installation, installation.enabled else { return }
        let tokenHex = token.map { String(format: "%02x", $0) }.joined()
        do {
            let receipt: NativePushDevice = try await api.request("v1/staff-app/native-push/devices", method: "POST", body: ["installationId": installation.installationId, "platform": "IOS", "applicationId": Bundle.main.bundleIdentifier ?? "", "token": tokenHex, "environment": Bundle.main.object(forInfoDictionaryKey: "StaffAPNSEnvironment") as? String ?? "SANDBOX"])
            guard actor == app.employee?.id else { return }
            self.installation?.deviceId = receipt.id; try persist(); registered = true
            state = "iPhone зарегистрирован. Доставка требует проверки уведомлением."
        } catch { registered = false; self.error = error.localizedDescription; state = "CRM не подтвердила регистрацию iPhone" }
    }
    func failedRegistration(_ error: Error) { registered = false; state = "Не удалось подключить уведомления этого iPhone"; self.error = "Проверьте подключение и настройки установки приложения с администратором." }
    func disable() async {
        if let id = installation?.deviceId, let api = app?.api {
            do { let _: EmptyResult = try await api.request("v1/staff-app/native-push/devices/\(id)", method: "DELETE") }
            catch { self.error = "CRM не подтвердила отключение: " + error.localizedDescription; return }
        }
        installation?.enabled = false; installation?.deviceId = nil
        do { try persist() } catch { self.error = error.localizedDescription }
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        registered = false; state = "Уведомления отключены на этом iPhone"
    }
    func accountEnded() {
        registered = false; available = false; actorId = nil; app = nil; keychain = nil; installation = nil
        UIApplication.shared.unregisterForRemoteNotifications(); UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    private func persist() throws { if let installation { try keychain?.write(JSONEncoder().encode(installation)) } }
    nonisolated static func eventId(_ userInfo: [AnyHashable: Any]) -> String? {
        guard ["INTERNAL_MESSAGE", "CLINIC_CHAT", "GROOMING"].contains(userInfo["kind"] as? String ?? ""), let id = userInfo["eventId"] as? String, UUID(uuidString: id) != nil else { return nil }
        return id
    }
    func tapped(_ eventId: String) { pendingEventId = eventId }
    func resolve(_ app: AppStore, chat: ChatStore, clinic: ClinicChatStore) async {
        guard let eventId = pendingEventId, let api = app.api, let actor = app.employee?.id, app.profile?.settings.enabled == true else { return }
        do {
            // The event lookup authenticates its recipient. Payload routes are never trusted directly.
            let event: NativePushEvent = try await api.request("v1/staff-app/native-push/events/\(eventId)")
            guard pendingEventId == eventId, app.employee?.id == actor else { return }
            pendingEventId = nil
            if event.kind == "CLINIC_CHAT", let channelId = event.channelId {
                await clinic.refresh(app, foreground: false, open: false)
                guard app.employee?.id == actor, clinic.summary?.id == channelId else { return }
                chat.selectedTab = 2; chat.openEmployee = nil; chat.showGeneral = true; await clinic.load(app); return
            }
            if event.kind == "GROOMING" && app.grooming { chat.selectedTab = 3; await app.loadInbox(); return }
            guard event.kind == "INTERNAL_MESSAGE", let employeeId = event.conversationEmployeeId, UUID(uuidString: employeeId) != nil else { return }
            await chat.refresh(app, foreground: false)
            guard app.employee?.id == actor else { return }
            if let person = chat.conversations.first(where: { $0.employee.id == employeeId })?.employee { chat.selectedTab = 2; chat.open(person); await chat.loadThread(app, markRead: false) }
        } catch {
            if (error as? APIError)?.unauthorized == true { app.handle(error) }
            else { pendingEventId = nil; self.error = "Это уведомление недоступно текущей учётной записи." }
        }
    }
    func foreground(_ eventId: String) async -> Bool {
        guard !seenEvents.contains(eventId), let app, let api = app.api, app.employee != nil, app.profile?.settings.notifications == true else { return false }
        do {
            let event: NativePushEvent = try await api.request("v1/staff-app/native-push/events/\(eventId)", passive: true)
            guard ["INTERNAL_MESSAGE", "CLINIC_CHAT", "GROOMING"].contains(event.kind) else { return false }
            seenEvents.insert(eventId); foregroundRevision += 1
            return true
        } catch { return false }
    }
}

final class StaffAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { Task { @MainActor in await NativePushCoordinator.shared.didRegister(deviceToken) } }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { Task { @MainActor in NativePushCoordinator.shared.failedRegistration(error) } }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let id = NativePushCoordinator.eventId(response.notification.request.content.userInfo) else { return }
        await MainActor.run { NativePushCoordinator.shared.tapped(id) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        guard let id = NativePushCoordinator.eventId(notification.request.content.userInfo) else { return [] }
        return await NativePushCoordinator.shared.foreground(id) ? [.banner, .sound, .badge] : []
    }
}
