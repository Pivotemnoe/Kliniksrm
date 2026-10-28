import SwiftUI

struct MessagesView: View {
    @Environment(AppStore.self) private var app
    @Environment(ChatStore.self) private var chat
    @Environment(ClinicChatStore.self) private var clinic
    @Environment(\.scenePhase) private var scenePhase
    @State private var selecting = false
    @State private var selectedColleague: Colleague?
    var body: some View {
        @Bindable var chat = chat
        List {
            Section {
                Button { chat.showGeneral = true; clinic.dismissAlerts() } label: {
                    HStack(spacing: 12) { Image(systemName: "person.3.fill").font(.title2).foregroundStyle(.teal); VStack(alignment: .leading, spacing: 5) { Text("Общий чат клиники").font(.headline); Text("Все сотрудники клиники").font(.caption).foregroundStyle(.secondary) }; Spacer(); if let count = clinic.summary?.unreadCount, count > 0 { Text("\(count)").font(.caption.bold()).padding(7).foregroundStyle(.white).background(.teal, in: Circle()) } }
                }.accessibilityIdentifier("clinic-chat-open")
            }
            if let error = chat.error { ProblemView(text: error, retry: { await chat.refresh(app); await chat.recipients(app) }) }
            if chat.conversations.isEmpty && chat.error == nil { ContentUnavailableView("Начните диалог", systemImage: "bubble.left.and.bubble.right", description: Text("Выберите коллегу, чтобы написать ему. История общая с CRM.")) }
            ForEach(chat.conversations) { conversation in
                Button { chat.open(conversation.employee) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(.teal)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(conversation.employee.fullName).font(.headline).foregroundStyle(.primary)
                            Text(conversation.lastMessage.body).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                            Text(ClinicTime.display(conversation.lastMessage.createdAt, full: true)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        if conversation.unreadCount > 0 { Text("\(conversation.unreadCount)").font(.caption.bold()).padding(7).foregroundStyle(.white).background(.teal, in: Circle()).accessibilityLabel("Непрочитанных: \(conversation.unreadCount)") }
                    }.padding(.vertical, 5)
                }.accessibilityIdentifier("conversation-\(conversation.id)")
            }
        }.navigationTitle("Сообщения")
            .toolbar { ToolbarItem(placement: .primaryAction) { Button { selecting = true } label: { Label("Написать", systemImage: "square.and.pencil") }.accessibilityIdentifier("new-message") } }
            .refreshable { await chat.refresh(app) }
            .task { await chat.refresh(app); await chat.recipients(app) }
            .sheet(isPresented: $selecting, onDismiss: { if let selectedColleague { chat.open(selectedColleague); self.selectedColleague = nil } }) { ColleaguePicker { selectedColleague = $0; selecting = false } }
            .navigationDestination(item: $chat.openEmployee) { person in ThreadView(person: person) }
            .navigationDestination(isPresented: $chat.showGeneral) { ClinicChatView() }
    }
}
struct ColleaguePicker: View {
    @Environment(AppStore.self) private var app
    @Environment(ChatStore.self) private var chat
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    let selected: (Colleague) -> Void
    var body: some View {
        NavigationStack {
            List {
                if let error = chat.error { ProblemView(text: error, retry: { await chat.recipients(app) }) }
                ForEach(chat.colleagues.filter { search.isEmpty || $0.fullName.localizedCaseInsensitiveContains(search) }) { person in
                    Button { selected(person) } label: { VStack(alignment: .leading, spacing: 5) { Text(person.fullName); if let position = person.position { Text(position).font(.caption).foregroundStyle(.secondary) } } }.accessibilityIdentifier("colleague-\(person.id)")
                }
            }.searchable(text: $search, prompt: "Имя коллеги").navigationTitle("Кому написать")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() } } }
                .task { await chat.recipients(app) }
        }
    }
}
struct ThreadView: View {
    @Environment(AppStore.self) private var app
    @Environment(ChatStore.self) private var chat
    @Environment(\.scenePhase) private var scenePhase
    let person: Colleague
    @FocusState private var composing: Bool
    var body: some View {
        @Bindable var chat = chat
        VStack(spacing: 0) {
            if let error = chat.error { ProblemView(text: error, retry: { await chat.loadThread(app, markRead: scenePhase == .active) }).padding(.horizontal) }
            ScrollViewReader { proxy in
                List {
                    if chat.hasMore { Button("Показать ранние сообщения") { Task { await chat.loadOlder(app) } } }
                    if chat.messages.isEmpty { Text(chat.checking ? "Загрузка истории…" : "Сообщений пока нет").foregroundStyle(.secondary) }
                    ForEach(chat.messages) { message in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(message.sender.id == app.employee?.id ? "Вы" : message.sender.fullName).font(.caption.bold()).foregroundStyle(.teal)
                            Text(message.body).textSelection(.enabled)
                            HStack { Text(ClinicTime.display(message.createdAt, full: true)); if message.sender.id == app.employee?.id { Text(message.readAt == nil ? "Отправлено" : "Прочитано") } }.font(.caption2).foregroundStyle(.secondary)
                        }.listRowBackground(message.sender.id == app.employee?.id ? Color.teal.opacity(0.08) : Color(.secondarySystemGroupedBackground)).id(message.id)
                            .onAppear { if scenePhase == .active && chat.selectedTab == 2 { Task { await chat.readVisible(message, app: app) } } }
                    }
                }.listStyle(.plain).refreshable { await chat.loadThread(app, markRead: scenePhase == .active) }
                    .onChange(of: chat.messages.last?.id) { _, id in if let id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } } }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if chat.uncertain { Text("Отправка не подтверждена. Обновите историю и проверьте последнее сообщение перед повтором.").font(.footnote).foregroundStyle(.orange) }
                HStack(alignment: .bottom) {
                    TextField("Сообщение", text: $chat.draft, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).focused($composing).accessibilityIdentifier("message-body").disabled(chat.sending)
                    Button { Task { await chat.send(app); if chat.draft.isEmpty { composing = false } } } label: { if chat.sending { ProgressView() } else { Image(systemName: "arrow.up.circle.fill").font(.title) } }.accessibilityLabel("Отправить сообщение").accessibilityIdentifier("message-send").disabled(chat.sending || chat.uncertain || !app.canWrite || chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || chat.draft.count > 4000 || person.status != "ACTIVE")
                }
                if chat.draft.count > 4000 { Text("Сообщение должно быть не длиннее 4000 символов.").font(.footnote).foregroundStyle(.orange) }
            }.padding().background(.bar)
        }.navigationTitle(person.fullName).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Готово") { composing = false }.accessibilityIdentifier("keyboard-done") } }
            .task(id: person.id) {
                while !Task.isCancelled && chat.openEmployee?.id == person.id {
                    if app.isForeground && chat.selectedTab == 2 { await chat.loadThread(app, markRead: true) }
                    do { try await Task.sleep(for: .seconds(8)) } catch { break }
                }
            }
            .onChange(of: chat.draft) { _, _ in app.activity() }
    }
}
