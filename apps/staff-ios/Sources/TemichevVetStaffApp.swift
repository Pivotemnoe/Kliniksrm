import SwiftUI

@main struct TemichevVetStaffApp: App {
    @UIApplicationDelegateAdaptor(StaffAppDelegate.self) private var delegate
    @State private var store = AppStore()
    @State private var chat = ChatStore()
    @State private var clinic = ClinicChatStore()
    @State private var push = NativePushCoordinator.shared
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(chat)
                .environment(clinic)
                .environment(push)
                .environment(\.locale, Locale(identifier: "ru_RU"))
                .environment(\.timeZone, ClinicTime.zone)
                .tint(.teal)
                .task { await store.start() }
                .task {
                    while !Task.isCancelled {
                        if store.isForeground && store.employee != nil { await store.idleCheck(); await chat.refresh(store, foreground: !push.registered); await clinic.refresh(store, foreground: !push.registered, open: chat.showGeneral && chat.selectedTab == 2) }
                        do { try await Task.sleep(for: .seconds(8)) } catch { break }
                    }
                }
                .onChange(of: store.employee?.id) { _, _ in chat.clear(); clinic.clear(); if store.employee != nil { Task { await chat.refresh(store); await clinic.refresh(store, foreground: false, open: false); await push.resume(store); await push.resolve(store, chat: chat, clinic: clinic) } } else { push.accountEnded() } }
                .onChange(of: store.profile?.settings.enabled) { _, _ in if store.profile?.settings.enabled == true { Task { await chat.refresh(store); await clinic.refresh(store, foreground: false, open: false); await push.resume(store); await push.resolve(store, chat: chat, clinic: clinic) } } }
                .onChange(of: push.pendingEventId) { _, _ in Task { await push.resolve(store, chat: chat, clinic: clinic) } }
                .onChange(of: push.foregroundRevision) { _, _ in Task { await chat.refresh(store, foreground: false); await clinic.refresh(store, foreground: false, open: chat.showGeneral) } }
                .task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(20)); if store.isForeground { await store.idleCheck() } } }
                .simultaneousGesture(DragGesture(minimumDistance: 0).onChanged { _ in store.activity() })
                .onChange(of: scenePhase, initial: true) { _, phase in store.isForeground = phase == .active; if phase == .active && store.employee != nil { Task { await store.resume() } } }
                .onChange(of: store.profile?.settings.notifications) { _, _ in if store.employee != nil { Task { await push.resume(store) } } }
                .onChange(of: chat.selectedTab) { _, _ in store.activity() }
                .overlay(alignment: .top) { if scenePhase == .active, let notice = chat.foregroundNotice { Button { if let target = chat.foregroundRoute, let person = chat.conversations.first(where: { $0.id == target.employeeId })?.employee { chat.selectedTab = 2; chat.open(person) } } label: { Label(notice, systemImage: "bubble.left.fill").font(.subheadline.bold()).padding().frame(maxWidth: .infinity).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)) }.padding().accessibilityIdentifier("new-message-banner") } }
                .overlay(alignment: .top) { if scenePhase == .active && clinic.foregroundAlert { Button { chat.selectedTab = 2; chat.openEmployee = nil; chat.showGeneral = true; clinic.dismissAlerts() } label: { Label(clinic.foregroundCount > 1 ? "Новых сообщений в общем чате: \(clinic.foregroundCount)" : "Новое сообщение в общем чате клиники", systemImage: "person.3.fill").font(.subheadline.bold()).padding().frame(maxWidth: .infinity).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)) }.padding().accessibilityIdentifier("new-clinic-message-banner") } }
                .overlay { if scenePhase != .active { Color(.systemBackground).ignoresSafeArea().overlay { BrandView() } } }
        }
    }
}
struct BrandView: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "pawprint.fill").font(.largeTitle).foregroundStyle(.teal).accessibilityHidden(true)
            VStack(alignment: .leading) { Text("TemichevVet").font(.title2.bold()); Text("Сотрудники").font(.subheadline).foregroundStyle(.secondary) }
        }.padding(.vertical, 12)
    }
}
struct ProblemView: View {
    let text: String
    var retry: (() async -> Void)?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Нет подтверждения CRM", systemImage: "exclamationmark.triangle").font(.headline)
            Text(text).font(.subheadline)
            if let retry { Button("Обновить данные") { Task { await retry() } }.accessibilityIdentifier("retry") }
        }.foregroundStyle(.primary).frame(maxWidth: .infinity, alignment: .leading).padding().background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
    }
}
struct RootView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        Group {
            if store.employee == nil { LoginView() }
            else if store.employee?.mustChangePassword == true { NavigationStack { PasswordView(first: true) } }
            else if let profile = store.profile {
                if profile.settings.enabled { WorkspaceView() }
                else { NavigationStack { ContentUnavailableView { Label("Приложение отключено", systemImage: "lock.shield") } description: { Text("Уполномоченный сотрудник может включить доступ в CRM: Настройки → Приложение сотрудников.") } actions: { Button("Обновить") { Task { await store.refresh() } }; Button("Выйти") { Task { await store.logout() } } } } }
            } else {
                NavigationStack { VStack(spacing: 20) { BrandView(); if let error = store.error { ProblemView(text: error, retry: { await store.refresh() }); Button("Выйти") { Task { await store.logout() } } } else { ProgressView("Подключение к CRM") } }.padding() }
            }
        }
    }
}
struct WorkspaceView: View {
    @Environment(AppStore.self) private var store
    @Environment(ChatStore.self) private var chat
    @Environment(ClinicChatStore.self) private var clinic
    var body: some View {
        @Bindable var chat = chat
        TabView(selection: $chat.selectedTab) {
            NavigationStack { AgendaView(today: true) }.tabItem { Label("Сегодня", systemImage: "sun.max") }.tag(0)
            NavigationStack { AgendaView(today: false) }.tabItem { Label("Записи", systemImage: "calendar") }.tag(1)
            NavigationStack { MessagesView() }.tabItem { Label("Сообщения", systemImage: "bubble.left.and.bubble.right") }.badge(chat.totalUnread + (clinic.summary?.unreadCount ?? 0)).tag(2)
            if store.grooming { NavigationStack { InboxView() }.tabItem { Label("Уведомления", systemImage: "bell") }.badge(store.inbox?.unread ?? 0).tag(3) }
            NavigationStack { ProfileView() }.tabItem { Label("Профиль", systemImage: "person.crop.circle") }.tag(4)
        }
    }
}
