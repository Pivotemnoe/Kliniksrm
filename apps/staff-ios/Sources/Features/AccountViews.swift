import SwiftUI

struct InboxView: View {
    @Environment(AppStore.self) private var store
    @State private var pending: String?
    var body: some View {
        List {
            if store.profile?.settings.notifications == false { Section { Text("Новые уведомления отключены для вас в CRM.").foregroundStyle(.secondary) } }
            if let error = store.error { ProblemView(text: error, retry: { await store.refresh() }) }
            if let inbox = store.inbox {
                if inbox.items.isEmpty { ContentUnavailableView("Новых сообщений пока нет", systemImage: "bell") }
                ForEach(inbox.items) { item in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { Label(item.event == "DURATION_CHANGED" ? "Уточнение длительности" : item.title, systemImage: item.event == "DURATION_CHANGED" ? "clock" : "bell").font(.headline); if item.readAt == nil && item.supersededAt == nil { Text("Новое").font(.caption).foregroundStyle(.teal) } }
                        Text(item.body)
                        Text(ClinicTime.display(item.createdAt, full: true)).font(.caption).foregroundStyle(.secondary)
                        if item.supersededAt != nil { Text("Обновлено").font(.caption).foregroundStyle(.secondary) }
                        if item.readAt == nil && item.supersededAt == nil { Button("Отметить прочитанным") { Task { await mark(item) } }.disabled(!store.canWrite || pending != nil).accessibilityIdentifier("read-\(item.id)") }
                        if let id = item.reservationId, let booking = store.agenda?.items.first(where: { $0.id == id }) { NavigationLink("Открыть запись") { BookingDetailView(initial: booking) } }
                    }.padding(.vertical, 6)
                }
            }
        }.navigationTitle(store.grooming ? "Уведомления" : "Сообщения").task { await store.loadInbox() }.refreshable { await store.refresh() }
    }
    private func mark(_ item: Notice) async {
        pending = item.id; defer { pending = nil }
        do { let _: EmptyResult = try await store.command("inbox/\(item.id)/read", body: [:]); await store.loadInbox() } catch { /* AppStore presents the server error. */ }
    }
}
struct ProfileView: View {
    @Environment(AppStore.self) private var store
    @Environment(NativePushCoordinator.self) private var push
    @State private var confirmLogout = false
    var body: some View {
        List {
            Section { BrandView(); Text(store.employee?.fullName ?? "").font(.headline); Text(store.employee?.roleTitle ?? "Сотрудник клиники").foregroundStyle(.secondary).accessibilityIdentifier("employee-role") }
            Section("Возможности") {
                Label(store.profile?.canBook == true ? "Запись с телефона включена" : "Записи доступны для просмотра", systemImage: store.profile?.canBook == true ? "calendar.badge.plus" : "eye")
                Text("Ваши рабочие права загружаются из CRM автоматически. Возможность создавать записи и получать уведомления зависит от настроек вашей учётной записи.").font(.footnote).foregroundStyle(.secondary)
                Label(store.accessType == "REMOTE" ? "Вход с iPhone" : "Сеанс CRM", systemImage: "lock.shield")
            }
            Section("Уведомления на iPhone") {
                Text(store.profile?.settings.notifications == true ? "Сообщения доступны внутри приложения." : "Уведомления отключены для вас в CRM.")
                Text(push.state).font(.footnote).foregroundStyle(.secondary)
                if let error = push.error { Text(error).font(.footnote).foregroundStyle(.orange) }
                if push.available && store.profile?.settings.notifications == true {
                    Button(push.registered ? "Отключить на этом iPhone" : "Включить на этом iPhone") { Task { if push.registered { await push.disable() } else { await push.enable(store) } } }.disabled(push.busy).accessibilityIdentifier("native-push-toggle")
                }
                Button("Проверить настройку доставки") { Task { await push.resume(store) } }
                Text("На экране блокировки показывается общий сигнал о новом сообщении. Текст переписки открывается после входа.").font(.footnote).foregroundStyle(.secondary)
            }
            Section { NavigationLink("Сменить пароль") { PasswordView(first: false) }; Button("Обновить права и данные") { Task { await store.refresh() } } }
            Section { Text(store.api?.address.origin ?? "").font(.footnote).foregroundStyle(.secondary); Button("Выйти из приложения", role: .destructive) { confirmLogout = true }.accessibilityIdentifier("logout") }
            if let error = store.error { ProblemView(text: error, retry: { await store.refresh() }) }
        }.navigationTitle("Мой профиль").confirmationDialog("Выйти из приложения?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) { Task { await push.disable(); await store.logout() } }
            Button("Выйти и очистить данные входа", role: .destructive) { Task { await push.disable(); await store.logout(forgetDevice: true) } }
            Button("Отмена", role: .cancel) {}
        }
    }
}
struct PasswordView: View {
    @Environment(AppStore.self) private var store
    let first: Bool
    @State private var current = ""
    @State private var new = ""
    @State private var repeated = ""
    @State private var busy = false
    @State private var saved = false
    var body: some View {
        Form {
            if first { Section { Text("Задайте личный пароль перед началом работы.") } }
            Section {
                SecureField("Текущий пароль", text: $current).textContentType(.password)
                SecureField("Новый пароль · от 8 символов", text: $new).textContentType(.newPassword)
                SecureField("Повторите новый пароль", text: $repeated).textContentType(.newPassword)
                Button("Сохранить пароль") { Task { busy = true; let result = await store.changePassword(current: current, new: new); current = ""; new = ""; repeated = ""; saved = result; busy = false } }.disabled(busy || current.isEmpty || new.count < 8 || new != repeated)
            }
            if busy { ProgressView("Ожидаем ответ CRM") }
            if saved { Label("Пароль изменён", systemImage: "checkmark.circle").foregroundStyle(.teal) }
            if let error = store.error { ProblemView(text: error) }
            if first { Button("Выйти") { Task { await store.logout() } } }
        }.navigationTitle(first ? "Личный пароль" : "Сменить пароль")
    }
}
