import Foundation

struct Colleague: Decodable, Identifiable, Hashable {
    let id: String
    let fullName: String
    let position: String?
    let status: String
    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
struct InternalMessage: Decodable, Identifiable {
    let id: String
    let body: String
    let readAt: String?
    let createdAt: String
    let sender: Colleague
    let recipient: Colleague
}
struct Conversation: Decodable, Identifiable {
    let employee: Colleague
    let lastMessage: InternalMessage
    let unreadCount: Int
    var id: String { employee.id }
}
struct Conversations: Decodable { let items: [Conversation]; let totalUnread: Int }
struct MessageThread: Decodable { let items: [InternalMessage]; let limit: Int; let hasMore: Bool?; let nextBeforeId: String? }
struct ChatRoute: Identifiable, Hashable { let employeeId: String; var id: String { employeeId } }
