import Foundation

struct Employee: Codable, Identifiable {
    let id: String
    let fullName: String
    let position: String?
    let roles: [String]
    let permissions: [String]
    var mustChangePassword: Bool
    var roleTitle: String {
        if roles.contains("director") { return "Директор" }
        if roles.contains("groomer") { return "Грумер" }
        if roles.contains("doctor") { return "Врач" }
        if roles.contains("administrator") { return "Администратор" }
        return position ?? "Сотрудник клиники"
    }
}
struct AuthResponse: Decodable { let employee: Employee; let accessType: String; let expiresAt: String? }
struct MobileSettings: Codable, Equatable {
    var enabled: Bool
    var clinicBooking: Bool
    var groomingBooking: Bool
    var notifications: Bool
}
struct MobileProfile: Decodable {
    let settings: MobileSettings
    let kind: String
    let canBook: Bool
    let canManage: Bool
    let canViewClinic: Bool
    let notificationMode: String
    var grooming: Bool { kind == "GROOMING" }
}
struct Pet: Codable, Identifiable, Hashable {
    let id: String
    let nickname: String
    let species: String?
    let breed: String?
}
struct Client: Codable, Identifiable {
    let id: String
    let fullName: String
    let phone: String?
    var animals: [Pet]
    let clientAccessToken: String?
}
struct Person: Codable { let fullName: String; let phone: String? }
struct PetSummary: Codable { let nickname: String; let species: String?; let breed: String? }
struct Place: Codable { let name: String }
struct Booking: Decodable, Identifiable {
    let id: String
    let ownerId: String
    let animalId: String
    let startsAt: String
    let endsAt: String?
    let status: String
    let comment: String?
    let notes: String?
    let serviceTitle: String?
    let version: Int?
    let species: String?
    let size: String?
    let coat: String?
    let rule: RuleRef?
    let animal: PetSummary
    let owner: Person
    let employee: Person?
    let room: Place?
    let location: Place?
    struct RuleRef: Decodable { let serviceId: String }
}
struct Shift: Decodable, Identifiable { let id: String; let startsAt: String; let endsAt: String }
struct Agenda: Decodable { let kind: String; let items: [Booking]; let shifts: [Shift] }
struct StaffTask: Decodable, Identifiable { let id: String; let title: String; let description: String?; let dueAt: String?; let status: String }
struct Notice: Decodable, Identifiable {
    let id: String
    let title: String
    let body: String
    let readAt: String?
    let supersededAt: String?
    let createdAt: String
    let reservationId: String?
    let event: String?
}
struct Inbox: Decodable { let items: [Notice]; let unread: Int }
struct ClinicResources: Decodable {
    let employees: [Doctor]
    let rooms: [Room]
    struct Doctor: Decodable, Identifiable { let id: String; let fullName: String }
    struct Room: Decodable, Identifiable { let id: String; let name: String; let officeId: String }
}
struct GroomingOverview: Decodable {
    let rules: [Rule]
    struct Rule: Decodable, Identifiable {
        let id: String
        let serviceId: String
        let isActive: Bool
        let species: String
        let service: Service
    }
    struct Service: Decodable { let title: String }
    var services: [(id: String, title: String)] {
        var seen = Set<String>()
        return rules.filter { $0.isActive && seen.insert($0.serviceId).inserted }.map { ($0.serviceId, $0.service.title) }
    }
}
struct PetSpecies: Decodable, Identifiable {
    let title: String
    let breeds: [Breed]
    var id: String { title }
    struct Breed: Decodable, Identifiable { let title: String; var id: String { title } }
}
struct Offers: Decodable { let offers: [Offer] }
struct Offer: Decodable, Identifiable {
    let offerToken: String
    let startsAt: String
    let endsAt: String
    let serviceTitle: String
    let priceLabel: String?
    let specialistName: String
    let locationName: String
    var id: String { offerToken }
}
struct Receipt: Decodable { let id: String?; let ok: Bool? }
struct EmptyResult: Decodable {}

enum ClinicTime {
    static let zone = TimeZone(identifier: "Europe/Moscow")!
    static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = zone; return c }
    static func date(_ text: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    static func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    static func day(_ date: Date) -> String { format(date, "yyyy-MM-dd") }
    static func format(_ date: Date, _ template: String) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "ru_RU"); f.timeZone = zone; f.dateFormat = template
        return f.string(from: date)
    }
    static func display(_ text: String, full: Bool = false) -> String {
        guard let d = date(text) else { return "Время не указано" }
        return format(d, full ? "d MMMM, HH:mm" : "HH:mm")
    }
    static func bounds(_ date: Date) -> (String, String) {
        let from = calendar.startOfDay(for: date)
        return (iso(from), iso(calendar.date(byAdding: .day, value: 1, to: from)!))
    }
}
func statusTitle(_ value: String) -> String {
    ["CONFIRMED": "Подтверждена", "PLANNED": "Запланирован", "SCHEDULED": "Запланирован", "ARRIVED": "Пришёл", "IN_PROGRESS": "На процедуре", "COMPLETED": "Завершён", "DONE": "Выполнено", "CANCELLED": "Отменена", "NO_SHOW": "Неявка", "NEW": "Новая", "OPEN": "Открыта", "PENDING": "Ожидает"][value] ?? value
}
