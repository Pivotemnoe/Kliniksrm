import Foundation
import Observation

@MainActor @Observable final class ChatStore {
    var colleagues: [Colleague] = []
    var conversations: [Conversation] = []
    var totalUnread = 0
    var messages: [InternalMessage] = []
    var openEmployee: Colleague?
    var route: ChatRoute?
    var selectedTab = 0
    var showGeneral = false
    var error: String?
    var sending = false
    var checking = false
    var uncertain = false
    var draft = ""
    var hasMore = false
    var nextBeforeId: String?
    var foregroundNotice: String?
    var foregroundRoute: ChatRoute?
    @ObservationIgnored private var actorId: String?
    @ObservationIgnored private var epoch = 0
    @ObservationIgnored private var seen = Set<String>()
    @ObservationIgnored private var initialLoad = true
    @ObservationIgnored private var notificationTargetActor: String?
    @ObservationIgnored private var sendSnapshot: (recipient: String, body: String, key: String)?
    @ObservationIgnored private var readIds = Set<String>()
    @ObservationIgnored private var alerts: [(messageId: String, colleague: Colleague)] = []
    func clear() {
        epoch += 1; actorId = nil; colleagues = []; conversations = []; messages = []; totalUnread = 0
        openEmployee = nil; route = nil; draft = ""; sending = false; checking = false; uncertain = false
        selectedTab = 0
        showGeneral = false
        seen = []; initialLoad = true; foregroundNotice = nil; foregroundRoute = nil
        hasMore = false; nextBeforeId = nil; sendSnapshot = nil; readIds = []
        alerts = []
        // Keep only an opaque pending route; it is rechecked against auth before use.
    }
    func refresh(_ app: AppStore, foreground: Bool = true) async {
        guard let actor = app.employee?.id, app.profile?.settings.enabled == true, let api = app.api else { return }
        if actorId != actor { clear(); actorId = actor }
        let token = epoch
        do {
            let result: Conversations = try await api.request("v1/internal-messages/conversations", passive: true)
            guard epoch == token, app.employee?.id == actor else { return }
            let previous = Dictionary(uniqueKeysWithValues: conversations.map { ($0.id, $0) })
            if !initialLoad && foreground && app.profile?.settings.notifications == true {
                for item in result.items where item.unreadCount > 0 && item.lastMessage.id != previous[item.id]?.lastMessage.id {
                    if openEmployee?.id == item.id && selectedTab == 2 { continue }
                    let page: MessageThread = try await api.request("v1/internal-messages?employeeId=\(item.id)&limit=200", passive: true)
                    guard epoch == token, app.employee?.id == actor else { return }
                    let candidates: [InternalMessage]
                    if let oldId = previous[item.id]?.lastMessage.id, let index = page.items.firstIndex(where: { $0.id == oldId }) { candidates = Array(page.items.dropFirst(index + 1)) }
                    else { candidates = page.items }
                    for message in candidates where message.recipient.id == actor && message.readAt == nil && !seen.contains(message.id) {
                        seen.insert(message.id); alerts.append((message.id, item.employee))
                    }
                }
            }
            for item in result.items { seen.insert(item.lastMessage.id) }
            conversations = result.items; totalUnread = result.totalUnread; error = nil
            alerts.removeAll { alert in result.items.first(where: { $0.id == alert.colleague.id })?.unreadCount == 0 }
            showNextAlert()
            initialLoad = false
            if let pending = route, notificationTargetActor == nil || notificationTargetActor == actor {
                if let other = result.items.first(where: { $0.employee.id == pending.employeeId })?.employee { openEmployee = other; selectedTab = 2; route = nil; notificationTargetActor = nil }
            } else if route != nil { route = nil; notificationTargetActor = nil }
        } catch { self.error = error.localizedDescription; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } }
    }
    func recipients(_ app: AppStore) async {
        guard let api = app.api, let actor = app.employee?.id else { return }
        let token = epoch
        do { let result: [Colleague] = try await api.request("v1/internal-messages/recipients"); guard token == epoch, actor == app.employee?.id else { return }; colleagues = result; error = nil }
        catch { self.error = error.localizedDescription; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } }
    }
    private func showNextAlert() {
        foregroundNotice = alerts.first.map { "Новое сообщение от \($0.colleague.fullName)" }
        foregroundRoute = alerts.first.map { ChatRoute(employeeId: $0.colleague.id) }
    }
    func dismissAlert() { if !alerts.isEmpty { alerts.removeFirst() }; showNextAlert() }
    func open(_ person: Colleague) {
        showGeneral = false
        alerts.removeAll { $0.colleague.id == person.id }; showNextAlert()
        if openEmployee?.id == person.id { return }
        epoch += 1; openEmployee = person; messages = []; draft = ""; uncertain = false; error = nil
        hasMore = false; nextBeforeId = nil; sendSnapshot = nil; readIds = []
    }
    func close() { epoch += 1; openEmployee = nil; messages = []; draft = ""; uncertain = false; sending = false }
    func loadThread(_ app: AppStore, markRead: Bool) async {
        guard let other = openEmployee, let api = app.api, let actor = app.employee?.id else { return }
        let token = epoch; checking = true
        defer { if token == epoch { checking = false } }
        do {
            let result: MessageThread = try await api.request("v1/internal-messages?employeeId=\(other.id)&limit=100", passive: true)
            guard token == epoch, other.id == openEmployee?.id, actor == app.employee?.id else { return }
            if let first = result.items.first, let index = messages.firstIndex(where: { $0.id == first.id }) { messages = Array(messages.prefix(index)) + result.items } else { messages = result.items }
            hasMore = result.hasMore ?? false; nextBeforeId = result.nextBeforeId; error = nil
            if uncertain { uncertain = false }
        } catch { self.error = error.localizedDescription; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } }
    }
    func readVisible(_ message: InternalMessage, app: AppStore) async {
        guard let other = openEmployee, let api = app.api, let actor = app.employee?.id,
              message.sender.id == other.id, message.recipient.id == actor, message.readAt == nil,
              selectedTab == 2, app.isForeground, !readIds.contains(message.id), !Task.isCancelled else { return }
        let token = epoch; readIds.insert(message.id)
        do {
            let _: EmptyResult = try await api.request("v1/internal-messages/conversations/\(other.id)/read", method: "POST", body: ["throughId": message.id], passive: true)
            guard token == epoch, other.id == openEmployee?.id, actor == app.employee?.id else { return }
            await refresh(app)
        } catch { if token == epoch { readIds.remove(message.id); self.error = error.localizedDescription } }
    }
    func loadOlder(_ app: AppStore) async {
        guard let id = nextBeforeId, let other = openEmployee, let api = app.api, let actor = app.employee?.id else { return }
        let token = epoch
        do {
            let result: MessageThread = try await api.request("v1/internal-messages?employeeId=\(other.id)&limit=100&beforeId=\(id)")
            guard token == epoch, app.employee?.id == actor, openEmployee?.id == other.id else { return }
            let existing = Set(messages.map(\.id)); messages = result.items.filter { !existing.contains($0.id) } + messages
            hasMore = result.hasMore ?? false; nextBeforeId = result.nextBeforeId
        } catch { self.error = error.localizedDescription }
    }
    func send(_ app: AppStore) async {
        guard let other = openEmployee, let api = app.api, let actor = app.employee?.id, app.canWrite, !sending, !uncertain else { return }
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty && body.count <= 4000 else { return }
        let token = epoch; sending = true; error = nil
        if sendSnapshot?.recipient != other.id || sendSnapshot?.body != body { sendSnapshot = (other.id, body, UUID().uuidString) }
        let key = sendSnapshot!.key
        defer { if token == epoch { sending = false } }
        do {
            let result: InternalMessage = try await api.request("v1/internal-messages", method: "POST", body: ["recipientId": other.id, "body": body, "clientKey": key])
            guard token == epoch, actor == app.employee?.id, openEmployee?.id == other.id else { return }
            if !messages.contains(where: { $0.id == result.id }) { messages.append(result) }
            draft = ""; sendSnapshot = nil; app.activity()
            await refresh(app)
        } catch {
            guard token == epoch else { return }
            self.error = error.localizedDescription
            // Keep the shared clientKey for manual reconciliation; never resend an unknown result automatically.
            uncertain = (error as? APIError)?.uncertain == true
            if (error as? APIError)?.unauthorized == true { app.handle(error); clear() }
        }
    }
    func receivePush(employeeId: String, recipientId: String) {
        guard UUID(uuidString: employeeId) != nil, UUID(uuidString: recipientId) != nil else { return }
        notificationTargetActor = recipientId; route = ChatRoute(employeeId: employeeId)
    }
}
