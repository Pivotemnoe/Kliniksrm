import XCTest
@testable import TemichevVetStaff

final class MemorySecrets: SecretStorage {
    var data: Data?
    func read() throws -> Data? { data }
    func write(_ data: Data) throws { self.data = data }
    func delete() throws { data = nil }
}
final class StubProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, [String: String], Data))?
    static var calls = 0
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.calls += 1
        do { let (code, headers, data) = try Self.handler!(request); let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: headers)!; client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed); client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self) }
        catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
@MainActor final class SecurityContractTests: XCTestCase {
    func client(_ storage: MemorySecrets = MemorySecrets()) throws -> APIClient {
        let config = APIClient.configuration(); config.protocolClasses = [StubProtocol.self]
        StubProtocol.calls = 0
        return try APIClient(address: ServerAddress("https://staff.example.test"), storage: storage, session: URLSession(configuration: config))
    }
    func testServerRejectsInsecureLANAndEmbeddedCredentials() throws {
        for text in ["http://192.168.1.20", "https://user:secret@example.test", "https://example.test?token=secret", "https://example.test/other", "file:///etc/passwd"] { XCTAssertThrowsError(try ServerAddress(text)) }
        XCTAssertEqual(try ServerAddress("https://staff.example.test/api").url.absoluteString, "https://staff.example.test/api/")
    }
    func testNoDiskCacheOrSystemCredentialCookieStorage() {
        let c = APIClient.configuration()
        XCTAssertNil(c.urlCache); XCTAssertNil(c.httpCookieStorage); XCTAssertNil(c.urlCredentialStorage)
        XCTAssertFalse(c.httpShouldSetCookies); XCTAssertFalse(c.waitsForConnectivity)
    }
    func testMoscowDayDoesNotFollowPhoneTimeZone() {
        let d = ClinicTime.date("2026-10-28T22:00:00Z")!
        let bounds = ClinicTime.bounds(d)
        XCTAssertEqual(ClinicTime.day(d), "2026-10-29")
        XCTAssertEqual(bounds.0, "2026-10-28T21:00:00Z"); XCTAssertEqual(bounds.1, "2026-10-29T21:00:00Z")
    }
    func testForeignOriginAndTraversalRejectedBeforeRequest() async throws {
        let api = try client()
        for path in ["https://other.example/api", "../secrets", "/auth/login"] {
            do { let _: EmptyResult = try await api.request(path); XCTFail("Expected rejection") } catch {}
        }
        XCTAssertEqual(StubProtocol.calls, 0)
    }
    func testCookieSurvivesClientRecreationAndLogoutKeepsDevice() async throws {
        let storage = MemorySecrets(); let api = try client(storage)
        StubProtocol.handler = { _ in (200, ["Set-Cookie": "clinic_crm_session=qa-session; Path=/; Secure; HttpOnly; Max-Age=3600"], Data("{}".utf8)) }
        let _: EmptyResult = try await api.request("auth/login", method: "POST", body: [:])
        XCTAssertTrue(api.hasSession)
        StubProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "clinic_crm_session=qa-session")
            return (200, ["Set-Cookie": "temichevvet_remote_device=qa-device; Path=/; Secure; HttpOnly; Max-Age=3600"], Data("{}".utf8))
        }
        let _: EmptyResult = try await api.request("v1/remote-access/enroll", method: "POST", body: [:])
        let restored = try client(storage); XCTAssertTrue(restored.hasSession)
        try restored.clearSession(); XCTAssertFalse(restored.hasSession)
        let creds = try JSONDecoder().decode(Credentials.self, from: storage.data!)
        XCTAssertEqual(creds.cookies.map(\.name), ["temichevvet_remote_device"])
        try restored.forgetDevice(); XCTAssertNil(storage.data)
    }
    func testClearingLoginDataPreservesInstallationForDeviceRevocation() throws {
        let storage = MemorySecrets(); let api = try client(storage)
        let installation = try api.staffInstallationId()
        XCTAssertNotNil(UUID(uuidString: installation))
        let restored = try client(storage)
        XCTAssertEqual(try restored.staffInstallationId(), installation)
        try restored.clearSession()
        XCTAssertEqual(try client(storage).staffInstallationId(), installation)
        try restored.forgetDevice()
        let cleared = try client(storage)
        XCTAssertFalse(cleared.hasSession)
        XCTAssertEqual(try cleared.staffInstallationId(), installation)
        XCTAssertTrue(try JSONDecoder().decode(Credentials.self, from: storage.data!).cookies.isEmpty)
    }
    func testPreviousBuildCredentialsDecodeBeforePhonePasswordUpgrade() throws {
        let storage = MemorySecrets()
        storage.data = Data("{\"origin\":\"https://staff.example.test\",\"cookies\":[],\"lastActivity\":0}".utf8)
        let upgraded = try client(storage)
        XCTAssertNotNil(UUID(uuidString: try upgraded.staffInstallationId()))
    }
    func testUnauthorizedClearsSessionAndPreservesError() async throws {
        let storage = MemorySecrets(); let api = try client(storage)
        StubProtocol.handler = { _ in (200, ["Set-Cookie": "clinic_crm_session=session; Path=/; Secure; Max-Age=3600"], Data("{}".utf8)) }
        let _: EmptyResult = try await api.request("auth/login", method: "POST", body: [:])
        StubProtocol.handler = { _ in (401, [:], Data("{\"message\":\"Сессия истекла\"}".utf8)) }
        do { let _: EmptyResult = try await api.request("auth/me"); XCTFail("Expected 401") }
        catch { XCTAssertTrue((error as? APIError)?.unauthorized == true) }
        XCTAssertFalse(api.hasSession)
    }
    func testLostMutationResponseIsUncertainAndNeverRetried() async throws {
        let api = try client()
        StubProtocol.handler = { _ in throw URLError(.timedOut) }
        do { let _: Receipt = try await api.request("v1/staff-app/clinic/appointments", method: "POST", body: ["clientKey": UUID().uuidString]); XCTFail("Expected timeout") }
        catch { XCTAssertTrue((error as? APIError)?.uncertain == true) }
        XCTAssertEqual(StubProtocol.calls, 1)
    }
    func testConflictIsNeverDecodedAsSuccess() async throws {
        let api = try client()
        StubProtocol.handler = { _ in (409, [:], Data("{\"message\":\"Версия изменилась\"}".utf8)) }
        do { let _: Receipt = try await api.request("v1/staff-app/grooming/bookings/id/status", method: "POST", body: [:]); XCTFail("Expected conflict") }
        catch { XCTAssertEqual(error.localizedDescription, "Версия изменилась") }
        XCTAssertEqual(StubProtocol.calls, 1)
    }
    func testKeychainRoundTrip() throws {
        let key = KeychainStore(account: "staff-ios-unit-" + UUID().uuidString)
        defer { try? key.delete() }
        XCTAssertNil(try key.read()); try key.write(Data("synthetic-unit-secret".utf8))
        XCTAssertEqual(try key.read(), Data("synthetic-unit-secret".utf8)); try key.delete(); XCTAssertNil(try key.read())
    }
    func testGroomingTransitionsHaveNoActionsAfterTerminalStatus() {
        XCTAssertEqual(StatusAction.available("CONFIRMED").map(\.status), ["ARRIVED", "CANCELLED", "NO_SHOW"])
        for status in ["COMPLETED", "CANCELLED", "NO_SHOW"] { XCTAssertTrue(StatusAction.available(status).isEmpty) }
    }
}
