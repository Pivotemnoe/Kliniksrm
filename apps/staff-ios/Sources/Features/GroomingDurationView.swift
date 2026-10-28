import SwiftUI

struct DurationSheet: Identifiable { let id = UUID(); let booking: Booking }
struct GroomingDurationView: View {
    @Environment(AppStore.self) private var app
    @Environment(\.dismiss) private var dismiss
    let booking: Booking
    @State private var minutes: Int
    @State private var key = UUID().uuidString
    @State private var busy = false
    @State private var blocked = false
    @State private var error: String?
    init(booking: Booking) {
        self.booking = booking
        let duration = (ClinicTime.date(booking.endsAt ?? "") ?? Date()).timeIntervalSince(ClinicTime.date(booking.startsAt) ?? Date()) / 60
        _minutes = State(initialValue: min(480, max(30, Int((duration / 30).rounded()) * 30)))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Уточнение длительности") {
                    Text(booking.animal.nickname).font(.headline)
                    LabeledContent("Начало", value: ClinicTime.display(booking.startsAt, full: true) + " · МСК")
                    Picker("Длительность", selection: $minutes) { ForEach(Array(stride(from: 30, through: 480, by: 30)), id: \.self) { Text("\($0) мин").tag($0) } }.accessibilityIdentifier("duration-minutes")
                    if let start = ClinicTime.date(booking.startsAt) { LabeledContent("Новое окончание", value: ClinicTime.format(start.addingTimeInterval(Double(minutes) * 60), "d MMMM, HH:mm") + " · МСК") }
                    Text("Начало, услуга, клиент, место, грумер и согласованная цена сохраняются. CRM проверит смену и соседние записи.").font(.footnote).foregroundStyle(.secondary)
                }
                Section { Button("Сохранить длительность") { Task { await save() } }.disabled(busy || blocked || !app.canWrite || booking.version == nil).accessibilityIdentifier("duration-save") }
                if busy { ProgressView("Ожидаем ответ CRM") }
                if let error { ProblemView(text: error); if blocked { Text("Закройте форму и получите свежую карточку перед следующей попыткой.").font(.footnote) } }
            }.navigationTitle("Длительность").navigationBarTitleDisplayMode(.inline).interactiveDismissDisabled(busy)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() }.disabled(busy) } }
        }
    }
    private func save() async {
        guard let api = app.api, let version = booking.version, app.canWrite, !busy, !blocked else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            let _: EmptyResult = try await api.request("v1/grooming/bookings/\(booking.id)/duration", method: "PATCH", body: ["clientKey": key, "version": version, "durationMinutes": minutes])
            app.banner = "Уточнение длительности сохранено в CRM."; app.activity(); await app.refresh(); dismiss()
        } catch {
            self.error = error.localizedDescription
            if let error = error as? APIError { blocked = error.uncertain; if case .server(409, _) = error { blocked = true }; if error.unauthorized { app.handle(error) } }
        }
    }
}
