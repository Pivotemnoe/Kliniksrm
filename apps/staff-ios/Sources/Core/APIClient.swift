import Foundation

struct ServerAddress: Equatable {
    let url: URL
    init(_ raw: String) throws {
        guard var parts = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host?.lowercased(), parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, ["", "/", "/api", "/api/"].contains(parts.path)
        else { throw APIError.configuration("Укажите защищённый адрес CRM без логина и параметров.") }
        var allowed = parts.scheme?.lowercased() == "https"
        #if DEBUG && targetEnvironment(simulator)
        allowed = allowed || (parts.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))
        #endif
        guard allowed else { throw APIError.configuration("Для CRM необходим адрес HTTPS.") }
        parts.host = host; parts.path = "/api/"
        guard let result = parts.url else { throw APIError.configuration("Проверьте адрес CRM.") }
        url = result
    }
    var origin: String { var p = URLComponents(url: url, resolvingAgainstBaseURL: false)!; p.path = ""; return p.string! }
}
enum APIError: LocalizedError {
    case configuration(String), server(Int, String), connection(uncertain: Bool), invalidResponse
    var errorDescription: String? {
        switch self {
        case .configuration(let message): return message
        case .server(_, let message): return message
        case .connection(let uncertain): return uncertain ? "Ответ CRM не получен. Результат действия неизвестен. Обновите расписание и проверьте запись перед повтором." : "Нет ответа CRM. Проверьте подключение и обновите данные."
        case .invalidResponse: return "CRM вернула неподдерживаемый ответ. Проверьте адрес и установленную серверную версию."
        }
    }
    var unauthorized: Bool { if case .server(401, _) = self { return true }; return false }
    var uncertain: Bool {
        switch self { case .connection(true), .invalidResponse: return true; case .server(let code, _): return code >= 500; default: return false }
    }
}
struct SavedCookie: Codable { let name: String; let value: String; let path: String; let secure: Bool; let expires: Date? }
struct Credentials: Codable { let origin: String; var cookies: [SavedCookie]; var lastActivity: Date }
final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor final class APIClient {
    let address: ServerAddress
    private let storage: any SecretStorage
    private let session: URLSession
    private let redirects = NoRedirects()
    private var credentials: Credentials
    private let decoder = JSONDecoder()
    static func configuration() -> URLSessionConfiguration {
        let c = URLSessionConfiguration.ephemeral
        c.urlCache = nil; c.httpCookieStorage = nil; c.urlCredentialStorage = nil
        c.httpShouldSetCookies = false; c.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        c.timeoutIntervalForRequest = 18; c.timeoutIntervalForResource = 25
        c.waitsForConnectivity = false
        return c
    }
    init(address: ServerAddress, storage: (any SecretStorage)? = nil, session: URLSession? = nil) throws {
        self.address = address
        let keychain = storage ?? KeychainStore(account: address.origin)
        self.storage = keychain
        self.session = session ?? URLSession(configuration: Self.configuration(), delegate: redirects, delegateQueue: nil)
        if let data = try keychain.read() {
            credentials = try decoder.decode(Credentials.self, from: data)
            guard credentials.origin == address.origin else { throw APIError.configuration("Сохранённая сессия относится к другому серверу.") }
        } else { credentials = Credentials(origin: address.origin, cookies: [], lastActivity: Date()) }
    }
    var hasSession: Bool { credentials.cookies.contains { Self.isSession($0.name) && ($0.expires ?? .distantFuture) > Date() } }
    var lastActivity: Date { credentials.lastActivity }
    func activity() throws { credentials.lastActivity = Date(); try persist() }
    func clearSession() throws { credentials.cookies.removeAll { Self.isSession($0.name) }; try persist() }
    func forgetDevice() throws { credentials.cookies = []; try storage.delete() }
    private func persist() throws { try storage.write(JSONEncoder().encode(credentials)) }
    static func isSession(_ name: String) -> Bool { name == "clinic_crm_session" || name == "staff_ios_qa_session" }
    static func accepted(_ name: String) -> Bool { isSession(name) || name == "temichevvet_remote_device" }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil, passive: Bool = false) async throws -> T {
        guard !path.hasPrefix("/"), !path.contains("://"), let url = URL(string: path, relativeTo: address.url)?.absoluteURL,
              url.host == address.url.host, url.port == address.url.port, url.scheme == address.url.scheme, url.path.hasPrefix("/api/")
        else { throw APIError.configuration("Недопустимый маршрут CRM.") }
        var req = URLRequest(url: url); req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        req.setValue("TemichevVetStaff-iOS/0.1", forHTTPHeaderField: "User-Agent")
        if passive { req.setValue("1", forHTTPHeaderField: "X-TemichevVet-Passive") }
        credentials.cookies.removeAll { ($0.expires ?? .distantFuture) <= Date() }
        let cookies = credentials.cookies.filter { url.path.hasPrefix($0.path) && (!$0.secure || url.scheme == "https") }
        if !cookies.isEmpty { req.setValue(cookies.map { "\($0.name)=\($0.value)" }.joined(separator: "; "), forHTTPHeaderField: "Cookie") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body); req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let data: Data; let response: URLResponse
        do { (data, response) = try await session.data(for: req) }
        catch is CancellationError { throw CancellationError() }
        catch { throw APIError.connection(uncertain: method != "GET") }
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { try clearSession() }
        guard (200..<300).contains(http.statusCode) else {
            let error = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = (error?["message"] as? String) ?? (error?["message"] as? [String])?.joined(separator: "\n") ?? "CRM отклонила запрос (\(http.statusCode))."
            throw APIError.server(http.statusCode, message)
        }
        let headers = http.allHeaderFields.reduce(into: [String: String]()) { if let k = $1.key as? String, let v = $1.value as? String { $0[k] = v } }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: url) where Self.accepted(cookie.name) {
            guard cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased() == url.host?.lowercased() else { continue }
            credentials.cookies.removeAll { $0.name == cookie.name }
            if (cookie.expiresDate ?? .distantFuture) > Date() {
                credentials.cookies.append(SavedCookie(name: cookie.name, value: cookie.value, path: cookie.path, secure: cookie.isSecure, expires: cookie.expiresDate))
            }
        }
        try persist()
        do { return try decoder.decode(T.self, from: data) } catch { throw APIError.invalidResponse }
    }
}
