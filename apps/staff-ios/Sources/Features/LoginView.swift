import SwiftUI

struct LoginView: View {
    @Environment(AppStore.self) private var store
    @State private var login = ""
    @State private var password = ""
    @State private var enroll = false
    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section { BrandView(); Text("Ваш рабочий день").font(.title.bold()); Text("Расписание клиники, свои задачи и сообщения. Для грумера — собственные записи.").foregroundStyle(.secondary) }
                Section("Подключение к CRM") {
                    TextField("https://адрес-клиники", text: $store.serverText).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("server")
                    Text("Адрес защищённого шлюза или CRM выдаёт клиника.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Учётная запись сотрудника") {
                    TextField("Телефон или email", text: $login).textContentType(.username).keyboardType(.asciiCapable).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("login")
                    SecureField("Пароль", text: $password).textContentType(.password).keyboardType(.asciiCapable).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("password")
                    Button { let value = password; password = ""; Task { await store.login(login, password: value) } } label: { HStack { Text("Войти"); Spacer(); if store.loading { ProgressView() } } }
                        .disabled(store.loading || login.count < 3 || password.count < 8 || store.serverText.isEmpty).accessibilityIdentifier("sign-in")
                }
                if let error = store.error { Section { ProblemView(text: error) } }
                if let banner = store.banner { Section { Label(banner, systemImage: "info.circle") } }
                Section { Button("Привязать доверенный iPhone") { store.error = nil; enroll = true }.accessibilityIdentifier("enroll-open") }
                Section { Text("Для удалённого входа сначала привяжите этот iPhone одноразовым приглашением из CRM. Используются ваши действующие права сотрудника.").font(.footnote).foregroundStyle(.secondary) }
            }.navigationTitle("Вход").sheet(isPresented: $enroll) { EnrollmentView() }
        }
    }
}
struct EnrollmentView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var name = "iPhone сотрудника"
    var body: some View {
        NavigationStack {
            Form {
                Section { Text("Попросите уполномоченного сотрудника создать приглашение в CRM для вашей учётной записи. Скопируйте код или полную ссылку.") }
                Section("Приглашение") {
                    SecureField("Код или ссылка приглашения", text: $code).keyboardType(.asciiCapable).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("enrollment-code")
                    TextField("Название телефона", text: $name).accessibilityIdentifier("device-name")
                    Button("Привязать iPhone") { let value = code; code = ""; Task { if await store.enroll(value, name: name) { dismiss() } } }.disabled(store.loading || code.count < 20 || name.count < 2).accessibilityIdentifier("enroll-submit")
                }
                if let error = store.error { Section { ProblemView(text: error) } }
            }.navigationTitle("Доверенный телефон").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() } } }
        }
    }
}
