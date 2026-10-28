import XCTest
@testable import TemichevVetStaff

@MainActor final class PushRoutingTests: XCTestCase {
    let actor = "11111111-1111-4111-8111-111111111111"
    let other = "22222222-2222-4222-8222-222222222222"
    let event = "33333333-3333-4333-8333-333333333333"
    let channel = "44444444-4444-4444-8444-444444444444"
    func app() throws -> AppStore {
        let store = AppStore()
        let c = APIClient.configuration(); c.protocolClasses = [StubProtocol.self]; StubProtocol.calls = 0
        store.api = try APIClient(address: ServerAddress("https://staff.example.test"), storage: MemorySecrets(), session: URLSession(configuration: c))
        store.employee = Employee(id: actor, fullName: "Вымышленный сотрудник", position: nil, roles: ["doctor"], permissions: [], mustChangePassword: false)
        store.profile = try JSONDecoder().decode(MobileProfile.self, from: Data("{\"settings\":{\"enabled\":true,\"clinicBooking\":false,\"groomingBooking\":false,\"notifications\":true},\"kind\":\"CLINIC\",\"canBook\":false,\"canManage\":false,\"canViewClinic\":true,\"notificationMode\":\"IN_APP\"}".utf8))
        store.confirmed = true
        return store
    }
    func testPushPayloadAcceptsOnlyKnownKindsAndOpaqueUUID() {
        for kind in ["INTERNAL_MESSAGE", "CLINIC_CHAT", "GROOMING"] { XCTAssertEqual(NativePushCoordinator.eventId(["kind": kind, "eventId": event]), event) }
        XCTAssertNil(NativePushCoordinator.eventId(["kind": "UNKNOWN", "eventId": event]))
        XCTAssertNil(NativePushCoordinator.eventId(["kind": "CLINIC_CHAT", "eventId": "https://foreign.example/secret"]))
        XCTAssertNil(NativePushCoordinator.eventId(["kind": "INTERNAL_MESSAGE", "conversationEmployeeId": other]))
    }
    func testGroupNotificationOpensVerifiedChannelWithoutReadReceipt() async throws {
        let store = try app(), chat = ChatStore(), clinic = ClinicChatStore(), push = NativePushCoordinator()
        var paths: [String] = []
        StubProtocol.handler = { [event, channel] request in
            paths.append(request.url!.path)
            let text = request.url!.path.contains("native-push/events") ? "{\"eventId\":\"\(event)\",\"kind\":\"CLINIC_CHAT\",\"channelId\":\"\(channel)\",\"conversationEmployeeId\":null}" : "{\"id\":\"\(channel)\",\"title\":\"Общий чат клиники\",\"unreadCount\":2,\"lastMessage\":null}"
            return (200, [:], Data(text.utf8))
        }
        push.tapped(event); await push.resolve(store, chat: chat, clinic: clinic)
        XCTAssertTrue(chat.showGeneral); XCTAssertEqual(chat.selectedTab, 2); XCTAssertNil(chat.openEmployee)
        XCTAssertNil(push.pendingEventId); XCTAssertFalse(paths.contains(where: { $0.hasSuffix("/read") }))
    }
    func testForeignEventDoesNotOpenOrReadAnyChat() async throws {
        let store = try app(), chat = ChatStore(), clinic = ClinicChatStore(), push = NativePushCoordinator()
        StubProtocol.handler = { _ in (404, [:], Data("{\"message\":\"Событие не найдено\"}".utf8)) }
        push.tapped(event); await push.resolve(store, chat: chat, clinic: clinic)
        XCTAssertFalse(chat.showGeneral); XCTAssertNil(chat.openEmployee); XCTAssertEqual(StubProtocol.calls, 1)
    }
    func testExpiredSessionKeepsOpaqueEventUntilLogin() async throws {
        let store = try app(), chat = ChatStore(), clinic = ClinicChatStore(), push = NativePushCoordinator()
        StubProtocol.handler = { _ in (401, [:], Data("{\"message\":\"Сессия истекла\"}".utf8)) }
        push.tapped(event); await push.resolve(store, chat: chat, clinic: clinic)
        XCTAssertNil(store.employee); XCTAssertFalse(chat.showGeneral); XCTAssertEqual(push.pendingEventId, event)
    }
    func testWrongChannelFromEventCannotOpenCurrentClinic() async throws {
        let store = try app(), chat = ChatStore(), clinic = ClinicChatStore(), push = NativePushCoordinator()
        StubProtocol.handler = { [event, channel] request in
            let text = request.url!.path.contains("native-push/events") ? "{\"eventId\":\"\(event)\",\"kind\":\"CLINIC_CHAT\",\"channelId\":\"foreign-channel\"}" : "{\"id\":\"\(channel)\",\"title\":\"Общий чат клиники\",\"unreadCount\":0,\"lastMessage\":null}"
            return (200, [:], Data(text.utf8))
        }
        push.tapped(event); await push.resolve(store, chat: chat, clinic: clinic)
        XCTAssertFalse(chat.showGeneral)
    }
    func testPassiveRequestsSetOnlyTheRequiredHeader() async throws {
        let store = try app()
        StubProtocol.handler = { request in XCTAssertEqual(request.value(forHTTPHeaderField: "X-TemichevVet-Passive"), "1"); return (200, [:], Data("{}".utf8)) }
        let _: EmptyResult = try await store.api!.request("v1/internal-messages/conversations", passive: true)
    }
}
