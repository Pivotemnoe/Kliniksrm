import Foundation
import Observation

struct ClinicMessage: Decodable, Identifiable {
    let id: String
    let channelId: String
    let body: String
    let clientKey: String
    let sequence: String
    let createdAt: String
    let sender: Colleague
}
struct ClinicChatSummary: Decodable { let id: String; let title: String; let unreadCount: Int; let lastMessage: ClinicMessage? }
struct ClinicChatPage: Decodable {
    let channelId: String; let title: String; let items: [ClinicMessage]; let readThroughSequence: String
    let hasMore: Bool; let nextBeforeSequence: String?; let limit: Int
}
struct ClinicReadReceipt: Decodable { let ok: Bool; let readThroughSequence: String }

@MainActor @Observable final class ClinicChatStore {
    var summary: ClinicChatSummary?
    var messages: [ClinicMessage] = []
    var readThroughSequence = "0"
    var nextBeforeSequence: String?
    var hasMore = false
    var loaded = false
    var loading = false
    var draft = ""
    var sending = false
    var uncertain = false
    var error: String?
    var foregroundAlert = false
    var foregroundCount = 0
    @ObservationIgnored private var actor: String?
    @ObservationIgnored private var epoch = 0
    @ObservationIgnored private var readIds = Set<String>()
    @ObservationIgnored private var sendSnapshot: (body: String, key: String)?
    @ObservationIgnored private var seen = Set<String>()
    func clear() {
        epoch += 1; actor = nil; summary = nil; messages = []; readThroughSequence = "0"; hasMore = false
        nextBeforeSequence = nil; draft = ""; sending = false; uncertain = false; error = nil; foregroundAlert = false; loaded = false; loading = false; readIds = []; sendSnapshot = nil
        seen = []; foregroundCount = 0
    }
    func refresh(_ app: AppStore, foreground: Bool, open: Bool) async {
        guard let id = app.employee?.id, app.profile?.settings.enabled == true, let api = app.api else { return }
        if actor != id { clear(); actor = id }
        let token = epoch
        do {
            let value: ClinicChatSummary = try await api.request("v1/internal-messages/clinic", passive: true)
            guard token == epoch, id == app.employee?.id else { return }
            if foreground && !open && app.profile?.settings.notifications == true && summary != nil, let last = value.lastMessage, last.id != summary?.lastMessage?.id, value.unreadCount > 0 {
                let page: ClinicChatPage = try await api.request("v1/internal-messages/clinic/messages?limit=200", passive: true)
                guard token == epoch, app.employee?.id == id else { return }
                let boundary = UInt64(summary?.lastMessage?.sequence ?? "0") ?? 0
                for message in page.items where message.sender.id != id && (UInt64(message.sequence) ?? 0) > boundary && !seen.contains(message.id) { seen.insert(message.id); foregroundCount += 1 }
                foregroundAlert = foregroundCount > 0
            }
            if let last = value.lastMessage { seen.insert(last.id) }
            if value.unreadCount == 0 { dismissAlerts() }
            summary = value; error = nil
        } catch { if token == epoch { self.error = error.localizedDescription; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } } }
    }
    func dismissAlerts() { foregroundAlert = false; foregroundCount = 0 }
    func load(_ app: AppStore, older: Bool = false) async {
        guard let id = app.employee?.id, let api = app.api else { return }
        let token = epoch; loading = true
        defer { if token == epoch { loading = false } }
        var path = "v1/internal-messages/clinic/messages?limit=100"
        if older, let before = nextBeforeSequence { path += "&beforeSequence=" + before }
        do {
            let page: ClinicChatPage = try await api.request(path, passive: !older)
            guard token == epoch, app.employee?.id == id else { return }
            if older { let ids = Set(messages.map(\.id)); messages = page.items.filter { !ids.contains($0.id) } + messages }
            else if let first = page.items.first, let index = messages.firstIndex(where: { $0.id == first.id }) { messages = Array(messages.prefix(index)) + page.items }
            else { messages = page.items }
            readThroughSequence = page.readThroughSequence; nextBeforeSequence = page.nextBeforeSequence; hasMore = page.hasMore; loaded = true; error = nil; uncertain = false
        } catch { if token == epoch { self.error = error.localizedDescription; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } } }
    }
    func visible(_ message: ClinicMessage, app: AppStore, chat: ChatStore) async {
        guard app.isForeground, chat.selectedTab == 2, chat.showGeneral, let id = app.employee?.id, message.sender.id != id,
              let api = app.api, !readIds.contains(message.id), (UInt64(message.sequence) ?? 0) > (UInt64(readThroughSequence) ?? 0) else { return }
        let token = epoch; readIds.insert(message.id)
        do {
            let receipt: ClinicReadReceipt = try await api.request("v1/internal-messages/clinic/read", method: "POST", body: ["throughId": message.id], passive: true)
            guard token == epoch, id == app.employee?.id else { return }
            if (UInt64(receipt.readThroughSequence) ?? 0) > (UInt64(readThroughSequence) ?? 0) { readThroughSequence = receipt.readThroughSequence }
            await refresh(app, foreground: false, open: true)
        } catch { if token == epoch { readIds.remove(message.id); self.error = error.localizedDescription } }
    }
    func send(_ app: AppStore) async {
        guard let id = app.employee?.id, let api = app.api, app.canWrite, !sending, !uncertain else { return }
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty && body.count <= 4000 else { return }
        if sendSnapshot?.body != body { sendSnapshot = (body, UUID().uuidString) }
        let key = sendSnapshot!.key, token = epoch; sending = true; error = nil
        defer { if token == epoch { sending = false } }
        do {
            let message: ClinicMessage = try await api.request("v1/internal-messages/clinic/messages", method: "POST", body: ["body": body, "clientKey": key])
            guard token == epoch, id == app.employee?.id else { return }
            if !messages.contains(where: { $0.id == message.id }) { messages.append(message) }
            draft = ""; sendSnapshot = nil; app.activity(); await refresh(app, foreground: false, open: true)
        } catch { if token == epoch { self.error = error.localizedDescription; uncertain = (error as? APIError)?.uncertain == true; if (error as? APIError)?.unauthorized == true { app.handle(error); clear() } } }
    }
}
