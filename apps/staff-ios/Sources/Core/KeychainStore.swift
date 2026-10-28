import Foundation
import Security

protocol SecretStorage { func read() throws -> Data?; func write(_ data: Data) throws; func delete() throws }
struct KeychainStore: SecretStorage {
    let account: String
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "ru.temichevvet.staff.native", kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false] }
    func read() throws -> Data? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?; let code = SecItemCopyMatching(q as CFDictionary, &value)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess else { throw KeychainError(code: code) }
        return value as? Data
    }
    func write(_ data: Data) throws {
        var attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let code = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if code == errSecItemNotFound {
            attrs.merge(query) { a, _ in a }
            let add = SecItemAdd(attrs as CFDictionary, nil)
            guard add == errSecSuccess else { throw KeychainError(code: add) }
        } else if code != errSecSuccess { throw KeychainError(code: code) }
    }
    func delete() throws {
        let code = SecItemDelete(query as CFDictionary)
        guard code == errSecSuccess || code == errSecItemNotFound else { throw KeychainError(code: code) }
    }
}
struct KeychainError: LocalizedError { let code: OSStatus; var errorDescription: String? { "Не удалось открыть защищённое хранилище (\(code)). Разблокируйте iPhone." } }
