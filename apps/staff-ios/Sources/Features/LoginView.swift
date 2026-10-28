import SwiftUI

struct LoginView: View {
    @Environment(AppStore.self) private var store
    @State private var login = ""
    @State private var password = ""
    @State private var settings = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BrandView()
                    Text("Вход в CRM клиники").font(.title2.bold())
                    Text("Введите свой номер телефона и пароль CRM. Ваша роль загрузится автоматически.").foregroundStyle(.secondary)
                }
                Section {
                    TextField("Номер телефона", text: $login).textContentType(.username).keyboardType(.phonePad).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("login")
                    SecureField("Пароль CRM", text: $password).textContentType(.password).keyboardType(.asciiCapable).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("password")
                    Button {
                        let value = password; password = ""
                        Task { await store.login(login, password: value) }
                    } label: {
                        HStack { Text("Войти"); Spacer(); if store.loading { ProgressView() } }
                    }.disabled(store.loading || login.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || password.count < 8).accessibilityIdentifier("sign-in")
                }
                if let error = store.error { Section { Label("Не удалось войти", systemImage: "exclamationmark.circle").font(.headline); Text(error) } }
                if let banner = store.banner { Section { Text(banner).foregroundStyle(.secondary) } }
                Section { Text("Используется ваша существующая учётная запись сотрудника клиники. Отдельная регистрация не нужна.").font(.footnote).foregroundStyle(.secondary) }
            }.navigationTitle("Сотрудники")
                .toolbar { ToolbarItem(placement: .primaryAction) { Button { settings = true } label: { Label("Подключение к клинике", systemImage: "gearshape") }.accessibilityIdentifier("connection-settings") } }
                .sheet(isPresented: $settings) { ConnectionSettingsView() }
        }
    }
}

struct ConnectionSettingsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Клиника TemichevVet") {
                    TextField("Адрес CRM", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("server")
                    Text("Для вашей клиники адрес уже настроен. Меняйте его только при подключении к другой CRM.").font(.footnote).foregroundStyle(.secondary)
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }.navigationTitle("Подключение")
                .onAppear { address = store.serverText }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Готово") { do { try store.changeServer(address); dismiss() } catch { self.error = error.localizedDescription } } }
                }
        }
    }
}
