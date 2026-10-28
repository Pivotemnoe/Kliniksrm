import Foundation
import Observation

@MainActor @Observable final class BookingDraft {
    let initial: Booking?
    var date: Date
    var clients: [Client] = []
    var selectedClient: Client?
    var animalId = ""
    var search = ""
    var newName = ""
    var needsClient = false
    var clinic: ClinicResources?
    var overview: GroomingOverview?
    var doctorId = ""
    var roomId = ""
    var serviceId = ""
    var species = "DOG"
    var size = "SMALL"
    var coat = "ANY"
    var notes = ""
    var consent = false
    var offers: [Offer] = []
    var selectedOffer: Offer?
    var searchedOffers = false
    var busy = false
    var error: String?
    var uncertain = false
    private var clientKey = UUID().uuidString
    init(initial: Booking?, date: Date) {
        self.initial = initial; self.date = date
        if let initial {
            selectedClient = Client(id: initial.ownerId, fullName: initial.owner.fullName, phone: initial.owner.phone, animals: [Pet(id: initial.animalId, nickname: initial.animal.nickname, species: initial.animal.species, breed: initial.animal.breed)], clientAccessToken: nil)
            animalId = initial.animalId; notes = initial.notes ?? ""; serviceId = initial.rule?.serviceId ?? ""
            species = initial.species ?? "DOG"; size = initial.size ?? "SMALL"; coat = initial.coat ?? "ANY"
        }
    }
    var fingerprint: String { [selectedClient?.id ?? "", animalId, ClinicTime.iso(date), doctorId, roomId, serviceId, species, size, coat, notes].joined(separator: "|") }
    func invalidate() { guard !busy && !uncertain else { return }; offers = []; selectedOffer = nil; searchedOffers = false; clientKey = UUID().uuidString }
    func select(_ client: Client) { selectedClient = client; animalId = client.animals.first?.id ?? ""; needsClient = false; invalidate() }
    func load(_ store: AppStore) async {
        busy = true; defer { busy = false }
        do {
            if store.grooming {
                overview = try await store.read("grooming/overview")
                if serviceId.isEmpty { serviceId = overview?.services.first?.id ?? "" }
                if initial == nil { clients = try await store.read("clients?search=") }
            } else {
                clinic = try await store.read("clinic/resources")
                doctorId = clinic?.employees.first(where: { $0.id == store.employee?.id })?.id ?? clinic?.employees.first?.id ?? ""
                date = ClinicTime.calendar.date(bySettingHour: 15, minute: 0, second: 0, of: date) ?? date
            }
        } catch { self.error = error.localizedDescription }
    }
    func lookup(_ store: AppStore) async {
        busy = true; error = nil; needsClient = false; defer { busy = false }
        do {
            let found: [Client]
            if store.grooming { found = try await store.command("clients/lookup", body: ["phone": search]) }
            else { var p = URLComponents(); p.queryItems = [URLQueryItem(name: "search", value: search)]; found = try await store.read("clients?" + p.percentEncodedQuery!) }
            clients = found; selectedClient = nil; animalId = ""; offers = []; selectedOffer = nil
            if found.count == 1 { select(found[0]) }
            needsClient = found.isEmpty && store.grooming
            if found.isEmpty && !store.grooming { error = "Клиент не найден. Уточните имя или телефон." }
        } catch { self.error = error.localizedDescription }
    }
    func addClient(_ store: AppStore) async {
        busy = true; error = nil; defer { busy = false }
        do { let result: Client = try await store.command("clients", body: ["phone": search, "fullName": newName]); clients = [result]; select(result) }
        catch { self.error = error.localizedDescription; uncertain = (error as? APIError)?.uncertain == true }
    }
    func findOffers(_ store: AppStore) async {
        guard let client = selectedClient else { return }
        busy = true; error = nil; offers = []; selectedOffer = nil; defer { busy = false }
        var body: [String: Any] = ["ownerId": client.id, "animalId": animalId, "serviceId": serviceId, "species": species, "size": species == "CAT" ? "ANY" : size, "coat": coat, "date": ClinicTime.day(date)]
        if let token = client.clientAccessToken { body["clientAccessToken"] = token }
        if let initial { body["reservationId"] = initial.id }
        do { let result: Offers = try await store.command("grooming/options", body: body); offers = result.offers; searchedOffers = true }
        catch { self.error = error.localizedDescription }
    }
    func save(_ store: AppStore) async -> Bool {
        guard let client = selectedClient, !animalId.isEmpty, !uncertain else { return false }
        busy = true; error = nil; defer { busy = false }
        do {
            if store.grooming {
                guard let offer = selectedOffer, consent else { return false }
                let path = initial.map { "grooming/bookings/\($0.id)/reschedule?version=\($0.version ?? 0)" } ?? "grooming/bookings"
                let _: Receipt = try await store.command(path, body: ["ownerId": client.id, "offerToken": offer.offerToken, "clientKey": clientKey, "notes": notes, "looks": [], "contactConsent": consent, "bookingConsent": consent])
                store.date = ClinicTime.date(offer.startsAt) ?? date
            } else {
                var body: [String: Any] = ["ownerId": client.id, "animalId": animalId, "employeeId": doctorId, "startsAt": ClinicTime.iso(date), "comment": String(notes.prefix(1000)), "clientKey": clientKey]
                if !roomId.isEmpty { body["roomId"] = roomId }
                let _: Receipt = try await store.command("clinic/appointments", body: body)
                store.date = date; store.scope = "clinic"
            }
            store.banner = initial == nil ? "Запись сохранена в общем расписании CRM." : "Перенос сохранён в CRM."
            await store.refresh()
            return true
        } catch { self.error = error.localizedDescription; uncertain = (error as? APIError)?.uncertain == true || (error as? APIError).map { if case .invalidResponse = $0 { return true }; return false } == true; return false }
    }
}
