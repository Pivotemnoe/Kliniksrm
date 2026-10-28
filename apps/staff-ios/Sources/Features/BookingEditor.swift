import SwiftUI

struct BookingEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: BookingDraft
    @State private var petSheet: PetSheet?
    init(initial: Booking?, date: Date) { _draft = State(initialValue: BookingDraft(initial: initial, date: date)) }
    private var disabled: Bool { draft.busy || draft.uncertain || !store.canBook }
    var body: some View {
        @Bindable var draft = draft
        NavigationStack {
            Form {
                if let error = draft.error { Section { ProblemView(text: error); if draft.uncertain { Text("Закройте форму и проверьте расписание. Это действие не будет отправлено повторно автоматически.").font(.footnote) } } }
                if !store.canBook { Section { Text("Запись недоступна до обновления подключения и прав.").foregroundStyle(.orange); Button("Обновить CRM") { Task { await store.refresh() } } } }
                if draft.initial == nil { clientLookup }
                if let client = draft.selectedClient {
                    Section("Клиент и питомец") {
                        Text(client.fullName).font(.headline)
                        if let phone = client.phone { Text(phone).foregroundStyle(.secondary) }
                        Picker("Питомец", selection: $draft.animalId) { Text("Выберите питомца").tag(""); ForEach(client.animals) { Text($0.nickname).tag($0.id) } }.accessibilityIdentifier("pet-picker").disabled(draft.initial != nil)
                        if store.grooming && draft.initial == nil { Button("Добавить питомца клиенту") { petSheet = PetSheet(client: client) }.disabled(disabled).accessibilityIdentifier("add-pet") }
                    }
                }
                if store.grooming { groomingFields } else { clinicFields }
                Section("Комментарий") { TextField("Пожелания к записи", text: $draft.notes, axis: .vertical).lineLimit(2...5).accessibilityIdentifier("booking-notes").onChange(of: draft.notes) { _, text in store.activity(); if text.count > (store.grooming ? 2000 : 1000) { draft.notes = String(text.prefix(store.grooming ? 2000 : 1000)) } } }
                if store.grooming {
                    Section {
                        Button("Найти свободное время") { Task { await draft.findOffers(store) } }.disabled(disabled || draft.selectedClient == nil || draft.animalId.isEmpty || draft.serviceId.isEmpty).accessibilityIdentifier("find-slots")
                    }
                    if draft.searchedOffers && draft.offers.isEmpty { Section { Text("Свободного времени на эту дату нет. Выберите другую дату.").foregroundStyle(.secondary) } }
                    if !draft.offers.isEmpty { offersSection }
                } else {
                    Section { Button("Создать запись") { Task { if await draft.save(store) { dismiss() } } }.disabled(disabled || draft.selectedClient == nil || draft.animalId.isEmpty || draft.doctorId.isEmpty).accessibilityIdentifier("save-clinic") }
                }
                if draft.busy { Section { ProgressView("Ожидаем ответ CRM") } }
            }
            .disabled(draft.busy)
            .navigationTitle(draft.initial == nil ? "Новая запись" : "Перенос записи").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() }.disabled(draft.busy) } }
            .interactiveDismissDisabled(draft.busy)
            .task { await draft.load(store) }
            .onChange(of: draft.fingerprint) { _, _ in draft.invalidate() }
            .sheet(item: $petSheet) { item in PetEditor(client: item.client) { pet in var updated = item.client; updated.animals.append(pet); draft.select(updated); draft.animalId = pet.id } }
        }
    }
    private var clientLookup: some View {
        @Bindable var draft = draft
        return Group {
            Section(store.grooming ? "Поиск по полному телефону" : "Поиск клиента") {
                TextField(store.grooming ? "+7 …" : "Имя или телефон", text: $draft.search).keyboardType(store.grooming ? .phonePad : .default).autocorrectionDisabled().accessibilityIdentifier("client-search")
                Button("Найти клиента") { Task { await draft.lookup(store) } }.disabled(disabled || (store.grooming ? draft.search.filter(\.isNumber).count < 10 : draft.search.count < 2)).accessibilityIdentifier("client-find")
                if draft.clients.count > 1 || (draft.selectedClient == nil && !draft.clients.isEmpty) {
                    ForEach(draft.clients) { client in Button { draft.select(client) } label: { VStack(alignment: .leading) { Text(client.fullName); if let phone = client.phone { Text(phone).font(.caption) } } }.accessibilityIdentifier("client-\(client.id)") }
                }
            }
            if draft.needsClient {
                Section("Клиент не найден") {
                    TextField("Имя нового клиента", text: $draft.newName).textContentType(.name).accessibilityIdentifier("client-name")
                    Button("Добавить клиента") { Task { await draft.addClient(store) } }.disabled(disabled || draft.newName.count < 2).accessibilityIdentifier("client-create")
                }
            }
        }
    }
    private var clinicFields: some View {
        @Bindable var draft = draft
        return Section("Приём в клинике") {
            Picker("Врач", selection: $draft.doctorId) { Text("Выберите врача").tag(""); ForEach(draft.clinic?.employees ?? []) { Text($0.fullName).tag($0.id) } }.accessibilityIdentifier("doctor-picker")
            Picker("Кабинет", selection: $draft.roomId) { Text("По правилам расписания").tag(""); ForEach(draft.clinic?.rooms ?? []) { Text($0.name).tag($0.id) } }
            DatePicker("Начало · МСК", selection: $draft.date).accessibilityIdentifier("clinic-start")
        }
    }
    private var groomingFields: some View {
        @Bindable var draft = draft
        return Section("Процедура") {
            Picker("Услуга", selection: $draft.serviceId) { Text("Выберите услугу").tag(""); ForEach(draft.overview?.services ?? [], id: \.id) { Text($0.title).tag($0.id) } }.accessibilityIdentifier("service-picker")
            Picker("Вид", selection: $draft.species) { Text("Собака").tag("DOG"); Text("Кошка").tag("CAT") }.accessibilityIdentifier("species-picker")
            if draft.species == "DOG" { Picker("Размер", selection: $draft.size) { Text("Маленький").tag("SMALL"); Text("Средний").tag("MEDIUM"); Text("Крупный").tag("LARGE") } }
            Picker("Шерсть", selection: $draft.coat) { Text("Любая").tag("ANY"); Text("Короткая").tag("SHORT"); Text("Длинная").tag("LONG"); Text("Кудрявая").tag("CURLY"); Text("Двойная").tag("DOUBLE") }
            DatePicker("Дата · МСК", selection: $draft.date, displayedComponents: .date).accessibilityIdentifier("grooming-date")
        }
    }
    private var offersSection: some View {
        @Bindable var draft = draft
        return Group {
            Section("Свободное время · МСК") {
                ForEach(draft.offers) { offer in
                    Button { draft.selectedOffer = offer } label: {
                        HStack { VStack(alignment: .leading) { Text("\(ClinicTime.display(offer.startsAt))–\(ClinicTime.display(offer.endsAt))"); Text(offer.priceLabel ?? offer.serviceTitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); if draft.selectedOffer?.id == offer.id { Image(systemName: "checkmark.circle.fill") } }
                    }.disabled(disabled).accessibilityIdentifier("slot-\(ClinicTime.display(offer.startsAt))")
                }
            }
            Section {
                Text("Время проверится повторно при подтверждении. До ответа CRM запись не считается сохранённой.").font(.footnote).foregroundStyle(.secondary)
                Toggle("Клиент подтвердил запись и согласие на связь", isOn: $draft.consent).accessibilityIdentifier("booking-consent")
                Button(draft.initial == nil ? "Подтвердить запись" : "Подтвердить перенос") { Task { if await draft.save(store) { dismiss() } } }.disabled(disabled || draft.selectedOffer == nil || !draft.consent).accessibilityIdentifier("save-grooming")
            }
        }
    }
}
struct PetSheet: Identifiable { let id = UUID(); let client: Client }
struct PetEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let client: Client
    let onSaved: (Pet) -> Void
    @State private var catalog: [PetSpecies] = []
    @State private var nickname = ""
    @State private var species = ""
    @State private var breed = ""
    @State private var busy = false
    @State private var uncertain = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Новый питомец · \(client.fullName)") {
                    TextField("Кличка", text: $nickname).accessibilityIdentifier("pet-name")
                    Picker("Вид", selection: $species) { Text("Выберите вид").tag(""); ForEach(catalog) { Text($0.title).tag($0.title) } }.accessibilityIdentifier("new-pet-species")
                    Picker("Порода", selection: $breed) { Text("Выберите породу").tag(""); ForEach(catalog.first(where: { $0.title == species })?.breeds ?? []) { Text($0.title).tag($0.title) } }.accessibilityIdentifier("new-pet-breed")
                    Button("Сохранить питомца") { Task { await save() } }.disabled(busy || uncertain || !store.canBook || nickname.isEmpty || nickname.count > 120 || species.isEmpty || breed.isEmpty).accessibilityIdentifier("pet-save")
                }
                if busy { ProgressView("Ожидаем ответ CRM") }
                if let error { ProblemView(text: error) }
            }.navigationTitle("Добавить питомца").navigationBarTitleDisplayMode(.inline).interactiveDismissDisabled(busy)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() }.disabled(busy) } }
                .task { do { let all: [PetSpecies] = try await store.read("pet-catalog"); catalog = all.filter { $0.title.localizedCaseInsensitiveContains("собак") || $0.title.localizedCaseInsensitiveContains("кош") } } catch { self.error = error.localizedDescription } }
                .onChange(of: species) { _, _ in breed = "" }
        }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            var body: [String: Any] = ["nickname": nickname, "species": species, "breed": breed]
            if let token = client.clientAccessToken { body["clientAccessToken"] = token }
            let pet: Pet = try await store.command("clients/\(client.id)/pets", body: body)
            onSaved(pet); dismiss()
        } catch { self.error = error.localizedDescription; uncertain = (error as? APIError)?.uncertain == true }
    }
}
