import SwiftUI

struct ClinicChatView: View {
    @Environment(AppStore.self) private var app
    @Environment(ChatStore.self) private var chat
    @Environment(ClinicChatStore.self) private var clinic
    @FocusState private var composing: Bool
    var body: some View {
        @Bindable var clinic = clinic
        VStack(spacing: 0) {
            if let error = clinic.error { ProblemView(text: error, retry: { await clinic.load(app) }).padding(.horizontal) }
            ScrollViewReader { proxy in
                List {
                    if clinic.hasMore { Button("Показать ранние сообщения") { Task { await clinic.load(app, older: true) } } }
                    if !clinic.loaded && clinic.error == nil { ProgressView("Загрузка общего чата") }
                    if clinic.loaded && clinic.messages.isEmpty { Text("Сообщений в этом канале пока нет").foregroundStyle(.secondary) }
                    ForEach(clinic.messages) { message in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(message.sender.fullName).font(.caption.bold()).foregroundStyle(.teal)
                            Text(message.body).textSelection(.enabled)
                            HStack { Text(ClinicTime.display(message.createdAt, full: true)); if message.sender.id == app.employee?.id { Text("Отправлено") } }.font(.caption2).foregroundStyle(.secondary)
                        }.id(message.id).listRowBackground(message.sender.id == app.employee?.id ? Color.teal.opacity(0.08) : Color(.secondarySystemGroupedBackground))
                            .onAppear { Task { await clinic.visible(message, app: app, chat: chat) } }
                    }
                }.listStyle(.plain).refreshable { await clinic.load(app) }
                    .onChange(of: clinic.messages.last?.id) { _, id in if let id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } } }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if clinic.uncertain { Text("Отправка не подтверждена. Обновите историю перед повтором.").font(.footnote).foregroundStyle(.orange) }
                HStack(alignment: .bottom) {
                    TextField("Сообщение в общий чат", text: $clinic.draft, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).focused($composing).accessibilityIdentifier("clinic-message-body").disabled(clinic.sending)
                    Button { Task { await clinic.send(app); if clinic.draft.isEmpty { composing = false } } } label: { if clinic.sending { ProgressView() } else { Image(systemName: "arrow.up.circle.fill").font(.title) } }.accessibilityLabel("Отправить в общий чат").accessibilityIdentifier("clinic-message-send").disabled(clinic.sending || clinic.uncertain || !app.canWrite || !clinic.loaded || clinic.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || clinic.draft.count > 4000)
                }
            }.padding().background(.bar)
        }.navigationTitle("Общий чат клиники").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Готово") { composing = false }.accessibilityIdentifier("keyboard-done") } }
            .task {
                clinic.dismissAlerts()
                while !Task.isCancelled && chat.showGeneral {
                    if app.isForeground && chat.selectedTab == 2 { await clinic.load(app) }
                    do { try await Task.sleep(for: .seconds(8)) } catch { break }
                }
            }
            .onChange(of: clinic.draft) { _, _ in app.activity() }
    }
}
