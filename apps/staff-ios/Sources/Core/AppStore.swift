import Foundation
import Observation
import Network

@MainActor @Observable final class AppStore {
    var employee: Employee?
    var profile: MobileProfile?
    var accessType = ""
    var loading = false
    var error: String?
    var banner: String?
    var serverText = UserDefaults.standard.string(forKey: "staff.server") ?? (Bundle.main.object(forInfoDictionaryKey: "StaffCRMServerURL") as? String ?? "https://staff.temichevvet.ru")
    var online = true
    var confirmed = false
    var isForeground = true
    var date = Date()
    var scope = "clinic"
    var agenda: Agenda?
    var tasks: [StaffTask] = []
    var inbox: Inbox?
    @ObservationIgnored var api: APIClient?
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var accountEpoch = 0
    @ObservationIgnored private var lastActivityWrite = Date.distantPast
    var canWrite: Bool { online && confirmed && profile?.settings.enabled == true && employee?.mustChangePassword == false }
    var canBook: Bool { canWrite && profile?.canBook == true }
    var grooming: Bool { profile?.grooming == true }

    init() {
        #if DEBUG && targetEnvironment(simulator)
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--server"), args.count > i + 1 { serverText = args[i + 1] }
        if let i = args.firstIndex(of: "--qa-date"), args.count > i + 1, let d = ClinicTime.date(args[i + 1] + "T12:00:00+03:00") { date = d }
        #endif
        monitor.pathUpdateHandler = { [weak self] path in Task { @MainActor in
            self?.online = path.status == .satisfied
            if path.status != .satisfied { self?.confirmed = false }
        } }
        monitor.start(queue: DispatchQueue(label: "ru.temichevvet.staff.connection"))
    }
    func connect() throws {
        let address = try ServerAddress(serverText)
        api = try APIClient(address: address)
        UserDefaults.standard.set(address.origin, forKey: "staff.server")
    }
    func changeServer(_ raw: String) throws {
        guard employee == nil else { throw APIError.configuration("Сначала выйдите из текущей CRM.") }
        let address = try ServerAddress(raw)
        api = nil; serverText = address.origin; error = nil; banner = nil
        UserDefaults.standard.set(address.origin, forKey: "staff.server")
    }
    func start() async {
        guard !serverText.isEmpty else { return }
        do { try connect(); if api?.hasSession == true { await resume() } }
        catch { handle(error) }
    }
    func login(_ login: String, password: String) async {
        guard !loading else { return }
        loading = true; error = nil; defer { loading = false }
        do {
            try connect()
            let result: AuthResponse = try await api!.request("auth/staff-login", method: "POST", body: ["login": login.trimmingCharacters(in: .whitespacesAndNewlines), "password": password, "installationId": try api!.staffInstallationId(), "deviceName": "iPhone сотрудника"])
            employee = result.employee; accessType = result.accessType
            try api?.activity()
            scope = "clinic"
            await refresh()
        } catch {
            if case APIError.server(404, _) = error { handle(APIError.configuration("Клиника ещё не подключила эту версию приложения. Вход заработает после обновления сервера CRM.")) }
            else if case APIError.connection = error { handle(APIError.configuration("Не удалось соединиться с клиникой. Проверьте интернет и повторите вход.")) }
            else { handle(error) }
        }
    }
    func resume() async {
        guard let api else { return }
        if api.hasSession && Date().timeIntervalSince(api.lastActivity) >= 15 * 60 {
            await logout(reason: "Время бездействия истекло. Войдите снова."); return
        }
        await refresh()
    }
    func activity() {
        guard employee != nil, Date().timeIntervalSince(lastActivityWrite) > 5 else { return }
        do { try api?.activity(); lastActivityWrite = Date() } catch { handle(error) }
    }
    func idleCheck() async {
        if employee != nil, let api, Date().timeIntervalSince(api.lastActivity) >= 15 * 60 { await logout(reason: "Время бездействия истекло. Войдите снова.") }
    }
    func refresh() async {
        guard let api else { return }
        let epoch = accountEpoch
        error = nil; confirmed = false
        do {
            let auth: AuthResponse = try await api.request("auth/me")
            guard epoch == accountEpoch else { return }
            employee = auth.employee; accessType = auth.accessType
            if auth.employee.mustChangePassword { return }
            let current: MobileProfile = try await api.request("v1/staff-app/me")
            guard epoch == accountEpoch else { return }
            profile = current
            guard current.settings.enabled else { clearClinical(); return }
            if !current.canViewClinic { scope = "mine" }
            confirmed = true
            await loadAgenda()
            if current.settings.notifications { await loadInbox() } else { inbox = nil }
        } catch { handle(error) }
    }
    func loadAgenda() async {
        guard let api, profile?.settings.enabled == true else { return }
        generation += 1; let requestGeneration = generation
        let (from, to) = ClinicTime.bounds(date)
        var parts = URLComponents(); parts.queryItems = [URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to), URLQueryItem(name: "scope", value: profile?.canViewClinic == true ? scope : "mine")]
        do {
            let result: Agenda = try await api.request("v1/staff-app/agenda?" + parts.percentEncodedQuery!)
            guard generation == requestGeneration else { return }
            agenda = result; confirmed = true; error = nil
            if !grooming { let result: [StaffTask] = try await api.request("v1/staff-app/tasks"); if generation == requestGeneration { tasks = result } }
        } catch { if requestGeneration == generation { handle(error) } }
    }
    func loadInbox() async {
        guard let api, profile?.settings.notifications == true else { return }
        let epoch = accountEpoch
        do { let result: Inbox = try await api.request("v1/staff-app/inbox"); if epoch == accountEpoch { inbox = result } } catch { if epoch == accountEpoch { handle(error) } }
    }
    func read<T: Decodable>(_ path: String) async throws -> T {
        guard let api else { throw APIError.configuration("Сначала подключите CRM.") }
        do { return try await api.request("v1/staff-app/" + path) }
        catch { handle(error); throw error }
    }
    func command<T: Decodable>(_ path: String, method: String = "POST", body: [String: Any]) async throws -> T {
        guard canWrite, let api else { throw APIError.configuration("Сначала обновите данные CRM при доступном подключении.") }
        do { let value: T = try await api.request(path.hasPrefix("auth/") ? path : "v1/staff-app/" + path, method: method, body: body); activity(); return value }
        catch { handle(error); throw error }
    }
    func changePassword(current: String, new: String) async -> Bool {
        guard let api, new.count >= 8 else { error = "Новый пароль должен содержать не менее 8 символов."; return false }
        do {
            let _: EmptyResult = try await api.request("auth/password", method: "PATCH", body: ["currentPassword": current, "newPassword": new])
            await refresh(); banner = "Пароль изменён в CRM."
            return true
        } catch { handle(error); return false }
    }
    func logout(reason: String? = nil, forgetDevice: Bool = false) async {
        let currentAPI = api
        accountEpoch += 1; loading = true
        employee = nil; profile = nil; confirmed = false; clearClinical(); banner = reason
        defer { loading = false }
        // Forget locally even if the server cannot acknowledge logout; never replay it on reconnect.
        if let currentAPI {
            do { let _: EmptyResult = try await currentAPI.request("auth/logout", method: "POST", body: [:]) }
            catch { banner = "Выход выполнен на iPhone. CRM не подтвердила прекращение сеанса. Доверие к телефону можно отозвать в CRM." }
        }
        do { if forgetDevice { try currentAPI?.forgetDevice() } else { try currentAPI?.clearSession() } }
        catch { self.error = error.localizedDescription }
    }
    private func clearClinical() { generation += 1; agenda = nil; tasks = []; inbox = nil }
    func handle(_ error: Error) {
        if error is CancellationError { return }
        confirmed = false
        self.error = error.localizedDescription
        if (error as? APIError)?.unauthorized == true { employee = nil; profile = nil; clearClinical() }
    }
}
