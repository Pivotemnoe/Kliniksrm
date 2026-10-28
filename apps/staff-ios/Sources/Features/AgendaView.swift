import SwiftUI

struct AgendaView: View {
    @Environment(AppStore.self) private var store
    let today: Bool
    @State private var bookingSheet: BookingSheet?
    var body: some View {
        @Bindable var store = store
        List {
            if today {
                Section { VStack(alignment: .leading, spacing: 8) { Text(store.employee?.fullName ?? "").font(.title2.bold()); Text(store.grooming ? "Кабинет грумера" : "Рабочий день клиники").foregroundStyle(.secondary) }.padding(.vertical, 6) }
            }
            Section {
                DatePicker("Дата · МСК", selection: $store.date, displayedComponents: .date).accessibilityIdentifier("agenda-date")
                if store.profile?.canViewClinic == true {
                    Picker("Чьё расписание", selection: $store.scope) { Text("Все приёмы").tag("clinic"); Text("Мои приёмы").tag("mine") }.pickerStyle(.segmented).accessibilityIdentifier("agenda-scope")
                }
                if let error = store.error { ProblemView(text: error, retry: { await store.refresh() }) }
                if !store.online { Label("Нет подключения. Изменения недоступны.", systemImage: "wifi.slash").foregroundStyle(.orange) }
                if !store.confirmed && store.agenda != nil { Text("Показаны ранее загруженные данные. Обновите их перед действием.").font(.footnote).foregroundStyle(.secondary) }
                if let banner = store.banner { Text(banner).font(.footnote).foregroundStyle(.teal) }
            }
            if let agenda = store.agenda {
                if !agenda.shifts.isEmpty {
                    Section("Мои смены") { ForEach(agenda.shifts) { shift in Label("\(ClinicTime.display(shift.startsAt))–\(ClinicTime.display(shift.endsAt)) · МСК", systemImage: "clock") } }
                }
                Section(store.grooming ? "Мои записи" : store.scope == "clinic" ? "Все приёмы клиники" : "Мои приёмы") {
                    if agenda.items.isEmpty { ContentUnavailableView("На эту дату записей нет", systemImage: "calendar") }
                    ForEach(agenda.items) { booking in
                        NavigationLink { BookingDetailView(initial: booking) } label: { BookingRow(booking: booking, showDoctor: store.profile?.canViewClinic == true && store.scope == "clinic") }.accessibilityIdentifier("booking-\(booking.id)")
                    }
                }
            } else if store.error == nil { ProgressView("Загружаем расписание") }
            if today && !store.grooming {
                Section("Мои задачи") {
                    let active = store.tasks.filter { !["DONE", "COMPLETED", "CANCELLED", "ARCHIVED"].contains($0.status) }
                    if active.isEmpty { Text("Нет открытых задач").foregroundStyle(.secondary) }
                    ForEach(active) { task in DisclosureGroup(task.title) { if let text = task.description { Text(text) }; if let due = task.dueAt { Text(ClinicTime.display(due, full: true)) }; Text(statusTitle(task.status)).foregroundStyle(.secondary) } }
                }
            }
        }
        .navigationTitle(today ? "Сегодня" : store.grooming ? "Мои записи" : "Приёмы")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button { Task { await store.refresh() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Обновить расписание").accessibilityIdentifier("agenda-refresh") }
            if store.profile?.canBook == true { ToolbarItem(placement: .primaryAction) { Button { bookingSheet = BookingSheet(initial: nil, date: store.date) } label: { Label("Записать", systemImage: "plus") }.disabled(!store.canBook).accessibilityIdentifier("new-booking") } }
        }
        .refreshable { await store.refresh() }
        .onChange(of: store.date) { _, _ in Task { await store.loadAgenda() } }
        .onChange(of: store.scope) { _, _ in Task { await store.loadAgenda() } }
        .sheet(item: $bookingSheet) { item in BookingEditor(initial: item.initial, date: item.date) }
    }
}
struct BookingSheet: Identifiable { let id = UUID(); let initial: Booking?; let date: Date }
struct BookingRow: View {
    let booking: Booking
    let showDoctor: Bool
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(ClinicTime.display(booking.startsAt)).font(.headline.monospacedDigit()).foregroundStyle(.teal).frame(minWidth: 48, alignment: .leading)
            VStack(alignment: .leading, spacing: 5) {
                Text(booking.animal.nickname).font(.headline)
                Text(booking.serviceTitle ?? booking.animal.species ?? "Приём").font(.subheadline).foregroundStyle(.secondary)
                Text(booking.owner.fullName).font(.subheadline)
                if showDoctor, let doctor = booking.employee { Text("Врач: \(doctor.fullName)").font(.caption).foregroundStyle(.secondary) }
                Text(statusTitle(booking.status)).font(.caption.weight(.medium)).padding(.horizontal, 8).padding(.vertical, 4).background(.teal.opacity(0.10), in: Capsule())
            }
        }.padding(.vertical, 6)
    }
}
struct BookingDetailView: View {
    @Environment(AppStore.self) private var store
    let initial: Booking
    @State private var current: Booking?
    @State private var moving: BookingSheet?
    @State private var durationSheet: DurationSheet?
    @State private var confirm: StatusAction?
    @State private var busy = false
    @State private var error: String?
    @State private var uncertain = false
    private var booking: Booking { current ?? initial }
    private var canOperate: Bool { store.canWrite && !busy && !uncertain && store.employee?.permissions.contains("grooming.operate") == true }
    var body: some View {
        List {
            Section {
                Text(booking.animal.nickname).font(.title2.bold())
                Label(statusTitle(booking.status), systemImage: "circle.fill").foregroundStyle(.teal)
                LabeledContent("Дата", value: ClinicTime.display(booking.startsAt, full: true) + " · МСК")
                if let ends = booking.endsAt { LabeledContent("Окончание", value: ClinicTime.display(ends)) }
                Text(booking.serviceTitle ?? "Клинический приём")
                Text([booking.animal.species, booking.animal.breed].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(.secondary)
            }
            Section("Клиент") { Text(booking.owner.fullName); if let phone = booking.owner.phone { Text(phone).textSelection(.enabled) } }
            Section("Запись в CRM") {
                if let employee = booking.employee { LabeledContent("Специалист", value: employee.fullName) }
                if let location = booking.location { Text(location.name) }
                if let room = booking.room { LabeledContent("Кабинет", value: room.name) }
                if let note = booking.notes ?? booking.comment, !note.isEmpty { Text(note).textSelection(.enabled) }
            }
            if let error { Section { ProblemView(text: error, retry: { await reload() }) } }
            if store.grooming {
                Section("Действия") {
                    if ["CONFIRMED", "ARRIVED", "IN_PROGRESS"].contains(booking.status) {
                        Button { durationSheet = DurationSheet(booking: booking) } label: { Label("Уточнить длительность", systemImage: "clock.badge.checkmark") }.disabled(!canOperate).accessibilityIdentifier("duration-open")
                    }
                    if store.profile?.canBook == true && booking.status == "CONFIRMED" {
                        Button("Перенести запись") { moving = BookingSheet(initial: booking, date: ClinicTime.date(booking.startsAt) ?? store.date) }.disabled(!canOperate || !store.canBook).accessibilityIdentifier("reschedule")
                    }
                    ForEach(StatusAction.available(booking.status)) { action in
                        Button(action.title, role: action.status == "CANCELLED" ? .destructive : nil) { confirm = action }.disabled(!canOperate).accessibilityIdentifier("status-\(action.status)")
                    }
                    if busy { ProgressView("Ожидаем ответ CRM") }
                }
            }
        }.navigationTitle("Карточка записи").navigationBarTitleDisplayMode(.inline)
            .task { if store.grooming { await reload() } }
            .refreshable { await reload() }
            .sheet(item: $moving, onDismiss: { Task { await reload() } }) { BookingEditor(initial: $0.initial, date: $0.date) }
            .sheet(item: $durationSheet, onDismiss: { Task { await reload() } }) { GroomingDurationView(booking: $0.booking) }
            .confirmationDialog(confirm?.title ?? "Подтвердить действие", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
                if let action = confirm { Button("Подтвердить", role: action.status == "CANCELLED" ? .destructive : nil) { Task { await changeStatus(action) } } }
                Button("Отмена", role: .cancel) { confirm = nil }
            } message: { Text("Изменение будет сохранено в общей CRM.") }
    }
    private func reload() async {
        guard store.grooming else { await store.refresh(); return }
        do { let value: Booking = try await store.read("grooming/bookings/\(initial.id)"); current = value; uncertain = false; error = nil; await store.refresh() } catch { self.error = error.localizedDescription }
    }
    private func changeStatus(_ action: StatusAction) async {
        guard let version = booking.version, canOperate else { return }
        busy = true; error = nil; defer { busy = false; confirm = nil }
        do {
            let _: EmptyResult = try await store.command("grooming/bookings/\(booking.id)/status", body: ["clientKey": UUID().uuidString, "version": version, "status": action.status])
            store.banner = "Статус сохранён в CRM."
            await reload()
        } catch { self.error = error.localizedDescription; uncertain = (error as? APIError)?.uncertain == true }
    }
}
struct StatusAction: Identifiable {
    let status: String
    let title: String
    var id: String { status }
    static func available(_ status: String) -> [StatusAction] {
        switch status {
        case "CONFIRMED": return [Self(status: "ARRIVED", title: "Клиент пришёл"), Self(status: "CANCELLED", title: "Отменить запись"), Self(status: "NO_SHOW", title: "Не пришёл")]
        case "ARRIVED": return [Self(status: "IN_PROGRESS", title: "Начать процедуру"), Self(status: "CANCELLED", title: "Отменить запись")]
        case "IN_PROGRESS": return [Self(status: "COMPLETED", title: "Завершить работу")]
        default: return []
        }
    }
}
