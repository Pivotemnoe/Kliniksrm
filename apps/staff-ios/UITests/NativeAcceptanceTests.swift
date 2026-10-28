import XCTest

struct QAInfo: Decodable {
    let date: String
    let users: [String: QAUser]
    let owner: QAOwner
    let otherAnimal: String
    struct QAUser: Decodable { let id: String; let login: String; let password: String }
    struct QAOwner: Decodable { let id: String; let phone: String; let animalId: String }
}

@MainActor final class NativeAcceptanceTests: XCTestCase {
    let app = XCUIApplication()
    var info: QAInfo!
    func qa(_ path: String) async throws -> Data {
        let url = URL(string: "http://127.0.0.1:4268/__qa/" + path)!
        let (data, response) = try await URLSession.shared.data(from: url)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return data
    }
    func screenshot(_ title: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = title; attachment.lifetime = .keepAlways; add(attachment)
    }
    func apiAs(_ role: String, path: String, body: [String: Any]? = nil) async throws -> Data {
        let session = URLSession(configuration: .ephemeral)
        var login = URLRequest(url: URL(string: "http://127.0.0.1:4268/api/auth/login")!)
        login.httpMethod = "POST"; login.setValue("application/json", forHTTPHeaderField: "Content-Type")
        login.httpBody = try JSONSerialization.data(withJSONObject: ["login": info.users[role]!.login, "password": info.users[role]!.password])
        let (_, logged) = try await session.data(for: login); XCTAssertEqual((logged as? HTTPURLResponse)?.statusCode, 200)
        var request = URLRequest(url: URL(string: "http://127.0.0.1:4268/api/" + path)!)
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: request)
        XCTAssertTrue((200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0))
        return data
    }
    func wait(_ element: XCUIElement, timeout: Double = 15, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Required native element is absent", file: file, line: line)
    }
    func reveal(_ element: XCUIElement, attempts: Int = 8) {
        for _ in 0..<attempts { if element.exists && element.isHittable { return }; app.swipeUp() }
    }
    func visibleSentMessage(_ text: String, file: StaticString = #filePath, line: UInt = #line) {
        let message = app.cells.containing(.staticText, identifier: text).firstMatch
        wait(message, file: file, line: line)
        if app.buttons["keyboard-done"].exists && app.buttons["keyboard-done"].isHittable { app.buttons["keyboard-done"].tap() }
        let keyboardGone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [keyboardGone], timeout: 10), .completed, "Native Done must dismiss the keyboard", file: file, line: line)
        let visible = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: message)
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 10), .completed, "Confirmed message must be visible without manual scrolling", file: file, line: line)
    }
    func signIn(_ role: String, remote: Bool = false) async throws {
        _ = try await qa("network?offline=false")
        _ = try await qa("clinic-booking?enabled=false")
        info = try JSONDecoder().decode(QAInfo.self, from: await qa("info"))
        app.launchArguments = ["--server", remote ? "http://localhost:4269" : "http://127.0.0.1:4268", "--qa-date", info.date, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.terminate(); app.launch()
        if !app.textFields["login"].waitForExistence(timeout: 3), app.tabBars.buttons["Профиль"].exists { logout() }
        wait(app.textFields["login"])
        app.textFields["login"].tap(); app.textFields["login"].typeText(info.users[role]!.login)
        app.secureTextFields["password"].tap(); app.secureTextFields["password"].typeText(info.users[role]!.password)
        XCTAssertTrue(app.buttons["sign-in"].isEnabled, "Password must be fully entered before submission")
        app.buttons["sign-in"].tap()
        wait(app.tabBars.buttons["Профиль"])
    }
    func logout() {
        for surface in [app, XCUIApplication(bundleIdentifier: "com.apple.springboard")] {
            let hint = surface.staticTexts["Speed up your typing by sliding your finger across the letters to compose a word."]
            let continueButton = surface.buttons["Continue"]
            if hint.exists && continueButton.exists && continueButton.isHittable { continueButton.tap() }
        }
        if app.buttons["keyboard-done"].exists && app.buttons["keyboard-done"].isHittable { app.buttons["keyboard-done"].tap() }
        let back = app.navigationBars.buttons["Сообщения"]
        if back.exists && back.isHittable { back.tap() }
        app.tabBars.buttons["Профиль"].tap()
        let exit = app.buttons["logout"]; reveal(exit); exit.tap()
        app.buttons["Выйти"].firstMatch.tap(); wait(app.textFields["login"])
    }
    func test01DoctorAllAppointmentsMineTasksMessagesAndKeychain() async throws {
        continueAfterFailure = false
        _ = try await qa("clinic-booking?enabled=false")
        try await signIn("doctor")
        wait(app.staticTexts[info.otherAnimal]); XCTAssertFalse(app.buttons["new-booking"].exists)
        screenshot("01-doctor-all-appointments")
        app.segmentedControls.buttons["Мои приёмы"].tap()
        XCTAssertFalse(app.staticTexts[info.otherAnimal].waitForExistence(timeout: 2))
        app.segmentedControls.buttons["Все приёмы"].tap(); wait(app.staticTexts[info.otherAnimal])
        app.staticTexts[info.otherAnimal].tap(); wait(app.staticTexts["Приём коллеги · синтетическая проверка iOS"])
        screenshot("02-colleague-appointment-card")
        app.navigationBars.buttons.firstMatch.tap()
        reveal(app.staticTexts["Проверить расписание на следующий день"]); wait(app.staticTexts["Проверить расписание на следующий день"])
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["conversation-" + info.users["director"]!.id]); app.buttons["conversation-" + info.users["director"]!.id].tap()
        wait(app.staticTexts["Тестовое сообщение: расписание подтверждено."])
        screenshot("03-doctor-inbox")
        app.terminate(); app.launch(); wait(app.tabBars.buttons["Профиль"])
        XCTAssertFalse(app.textFields["login"].exists)
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["conversation-" + info.users["director"]!.id]); app.buttons["conversation-" + info.users["director"]!.id].tap(); wait(app.staticTexts["Тестовое сообщение: расписание подтверждено."])
        logout()
    }
    func test02ClinicBookingIndividualGrantPersistsInCRM() async throws {
        continueAfterFailure = false
        try await signIn("doctor")
        _ = try await qa("clinic-booking?enabled=true")
        app.buttons["agenda-refresh"].tap()
        wait(app.buttons["new-booking"]); app.buttons["new-booking"].tap()
        wait(app.textFields["client-search"]); app.textFields["client-search"].tap(); app.textFields["client-search"].typeText(info.owner.phone)
        app.buttons["client-find"].tap()
        reveal(app.buttons["save-clinic"]); wait(app.buttons["save-clinic"])
        let pet = app.buttons["pet-picker"]; pet.tap()
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Тедди")).firstMatch.tap()
        reveal(app.buttons["save-clinic"]); app.buttons["save-clinic"].tap()
        wait(app.staticTexts["Запись сохранена в общем расписании CRM."])
        screenshot("04-clinic-booking-confirmed")
        app.terminate(); app.launch(); reveal(app.staticTexts["15:00"]); wait(app.staticTexts["15:00"])
        logout()
        _ = try await qa("clinic-booking?enabled=false")
    }
    func test03GroomerCreatesMovesCompletesAndCancelsOwnBooking() async throws {
        continueAfterFailure = false
        try await signIn("groomer")
        XCTAssertFalse(app.segmentedControls["agenda-scope"].exists)
        screenshot("05-groomer-agenda")
        app.buttons["new-booking"].tap(); wait(app.textFields["client-search"])
        app.textFields["client-search"].tap(); app.textFields["client-search"].typeText(info.owner.phone); app.buttons["client-find"].tap()
        let pet = app.buttons["pet-picker"]; wait(pet); pet.tap()
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Тедди")).firstMatch.tap()
        let slots = app.buttons["find-slots"]; reveal(slots); slots.tap()
        let slot = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'slot-'")).firstMatch
        reveal(slot); wait(slot); slot.tap()
        let consent = app.switches["booking-consent"]; reveal(consent)
        if consent.switches.firstMatch.exists { consent.switches.firstMatch.tap() } else { consent.tap() }
        XCTAssertEqual(consent.value as? String, "1")
        XCTAssertTrue(app.buttons["save-grooming"].isEnabled)
        reveal(app.buttons["save-grooming"]); app.buttons["save-grooming"].tap(); wait(app.staticTexts["Запись сохранена в общем расписании CRM."])
        app.terminate(); app.launch(); wait(app.buttons["new-booking"])
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'booking-'")).firstMatch
        if row.exists { row.tap() } else { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Тедди")).firstMatch.tap() }
        let move = app.buttons["reschedule"]; reveal(move); wait(move); move.tap()
        reveal(app.buttons["find-slots"]); app.buttons["find-slots"].tap()
        reveal(slot); wait(slot); slot.tap(); reveal(consent)
        if consent.switches.firstMatch.exists { consent.switches.firstMatch.tap() } else { consent.tap() }
        XCTAssertEqual(consent.value as? String, "1")
        reveal(app.buttons["save-grooming"]); app.buttons["save-grooming"].tap()
        wait(app.staticTexts["Карточка записи"])
        screenshot("06-groomer-rescheduled-card")
        for status in ["ARRIVED", "IN_PROGRESS", "COMPLETED"] {
            if status == "COMPLETED" {
                let state = try JSONSerialization.jsonObject(with: await qa("state")) as! [String: Any]
                let active = (state["grooming"] as! [[String: Any]]).first(where: { $0["status"] as? String == "IN_PROGRESS" })!
                _ = try await qa("visit-started?id=" + (active["id"] as! String))
            }
            let button = app.buttons["status-" + status]; reveal(button); wait(button); button.tap(); app.buttons["Подтвердить"].firstMatch.tap()
            if status != "COMPLETED" { wait(app.buttons["status-" + (status == "ARRIVED" ? "IN_PROGRESS" : "COMPLETED")]) }
        }
        wait(app.staticTexts["Завершён"]); screenshot("07-groomer-completed")
        logout()
    }
    func test04OfflineDoesNotReplayAndExpiryRequiresLogin() async throws {
        continueAfterFailure = false
        try await signIn("doctor")
        _ = try await qa("network?offline=true")
        app.buttons["agenda-refresh"].tap(); wait(app.staticTexts["Нет подтверждения CRM"])
        screenshot("08-offline-no-replay")
        XCTAssertFalse(app.buttons["new-booking"].exists)
        _ = try await qa("network?offline=false")
        app.buttons["retry"].firstMatch.tap(); wait(app.staticTexts[info.otherAnimal])
        _ = try await qa("expire?role=doctor")
        app.buttons["agenda-refresh"].tap(); wait(app.textFields["login"])
        screenshot("09-expired-session")
    }
    func test05PhonePasswordRemoteLoginAndRevocation() async throws {
        continueAfterFailure = false
        try await signIn("groomer", remote: true)
        app.tabBars.buttons["Профиль"].tap(); wait(app.staticTexts["Вход с iPhone"])
        wait(app.staticTexts["employee-role"]); XCTAssertEqual(app.staticTexts["employee-role"].label, "Грумер")
        screenshot("10-phone-password-remote-login")
        app.terminate(); app.launch(); wait(app.tabBars.buttons["Профиль"])
        _ = try await qa("revoke?role=groomer")
        // Foreground polling must revoke the open app as well; no tap on an already-dismissed profile.
        wait(app.textFields["login"], timeout: 20)
        XCTAssertFalse(app.buttons["enroll-open"].exists)
        XCTAssertFalse(app.secureTextFields["enrollment-code"].exists)
        screenshot("10b-revoked-phone-must-login")
    }
    func test10DirectorUsesExistingPhonePasswordWithoutInvitations() async throws {
        continueAfterFailure = false
        try await signIn("director", remote: true)
        wait(app.staticTexts[info.otherAnimal])
        app.tabBars.buttons["Профиль"].tap()
        wait(app.staticTexts["employee-role"]); XCTAssertEqual(app.staticTexts["employee-role"].label, "Директор")
        wait(app.staticTexts["Вход с iPhone"]); screenshot("20-director-existing-crm-account")
        logout()
        XCTAssertFalse(app.buttons["enroll-open"].exists)
        XCTAssertFalse(app.textFields["server"].exists)
        wait(app.staticTexts["Вход в CRM клиники"]); screenshot("21-simple-phone-password-login")
    }
    func test06PersonalChatDoctorGroomerAndDoctorDoctor() async throws {
        continueAfterFailure = false
        let message = "Проверка iPhone " + String(UUID().uuidString.prefix(8))
        try await signIn("doctor")
        app.tabBars.buttons["Сообщения"].tap(); app.buttons["new-message"].tap()
        wait(app.buttons["colleague-" + info.users["groomer"]!.id]); app.buttons["colleague-" + info.users["groomer"]!.id].tap()
        wait(app.textFields["message-body"]); app.textFields["message-body"].tap(); app.textFields["message-body"].typeText(message)
        app.buttons["message-send"].tap(); visibleSentMessage(message); screenshot("11-personal-chat-sent-from-iphone")
        logout()
        try await signIn("groomer")
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["conversation-" + info.users["doctor"]!.id]); app.buttons["conversation-" + info.users["doctor"]!.id].tap()
        wait(app.staticTexts[message]); screenshot("12-groomer-received-doctor-message")
        let reply = "Ответ грумера " + String(UUID().uuidString.prefix(8))
        app.textFields["message-body"].tap(); app.textFields["message-body"].typeText(reply); app.buttons["message-send"].tap(); visibleSentMessage(reply)
        logout(); try await signIn("doctor")
        let colleague = "Сообщение коллеги " + String(UUID().uuidString.prefix(8))
        _ = try await apiAs("colleague", path: "v1/internal-messages", body: ["recipientId": info.users["doctor"]!.id, "body": colleague, "clientKey": UUID().uuidString])
        wait(app.buttons["new-message-banner"], timeout: 20); screenshot("13-foreground-message-alert")
        app.buttons["new-message-banner"].tap(); wait(app.staticTexts[colleague])
        app.terminate(); app.launch(); wait(app.tabBars.buttons["Профиль"])
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["conversation-" + info.users["groomer"]!.id]); app.buttons["conversation-" + info.users["groomer"]!.id].tap(); wait(app.staticTexts[reply])
        screenshot("14-chat-history-after-restart"); logout()
    }
    func test07GeneralClinicChatIsSharedWithIndependentReadState() async throws {
        continueAfterFailure = false
        let text = "Общий чат iPhone " + String(UUID().uuidString.prefix(8))
        try await signIn("doctor")
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["clinic-chat-open"]); app.buttons["clinic-chat-open"].tap()
        wait(app.textFields["clinic-message-body"]); app.textFields["clinic-message-body"].tap(); app.textFields["clinic-message-body"].typeText(text); app.buttons["clinic-message-send"].tap()
        visibleSentMessage(text); screenshot("15-clinic-chat-sent")
        let groomerPage = try JSONSerialization.jsonObject(with: await apiAs("groomer", path: "v1/internal-messages/clinic/messages")) as! [String: Any]
        let directorPage = try JSONSerialization.jsonObject(with: await apiAs("director", path: "v1/internal-messages/clinic/messages")) as! [String: Any]
        let a = try XCTUnwrap((groomerPage["items"] as! [[String: Any]]).first(where: { $0["body"] as? String == text }))
        let b = try XCTUnwrap((directorPage["items"] as! [[String: Any]]).first(where: { $0["body"] as? String == text }))
        XCTAssertEqual(a["id"] as? String, b["id"] as? String)
        logout(); try await signIn("groomer")
        app.tabBars.buttons["Сообщения"].tap(); wait(app.buttons["clinic-chat-open"]); app.buttons["clinic-chat-open"].tap(); wait(app.staticTexts[text])
        screenshot("16-clinic-chat-groomer-received")
        let directorSummary = try JSONSerialization.jsonObject(with: await apiAs("director", path: "v1/internal-messages/clinic")) as! [String: Any]
        XCTAssertGreaterThan(directorSummary["unreadCount"] as! Int, 0)
        let response = "Ответ в общий чат " + String(UUID().uuidString.prefix(8))
        app.textFields["clinic-message-body"].tap(); app.textFields["clinic-message-body"].typeText(response); app.buttons["clinic-message-send"].tap(); visibleSentMessage(response)
        screenshot("17-clinic-chat-groomer-replied"); logout()
    }
    func test08GroomerRefinesOwnBookingDuration() async throws {
        try await signIn("groomer")
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'booking-'")).firstMatch
        wait(row); let bookingId = row.identifier.replacingOccurrences(of: "booking-", with: ""); row.tap()
        let duration = app.buttons["duration-open"]; reveal(duration); wait(duration); duration.tap()
        wait(app.buttons["duration-minutes"]); app.buttons["duration-minutes"].tap(); app.buttons["120 мин"].firstMatch.tap()
        app.buttons["duration-save"].tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["duration-save"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
        let card = try JSONSerialization.jsonObject(with: await apiAs("groomer", path: "v1/grooming/bookings/" + bookingId)) as! [String: Any]
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let start = f.date(from: card["startsAt"] as! String)!, end = f.date(from: card["endsAt"] as! String)!
        XCTAssertEqual(end.timeIntervalSince(start), 7200)
        screenshot("18-groomer-duration-saved"); logout()
    }
    func test09GroomerAddsClientAndPetThroughNativeForms() async throws {
        try await signIn("groomer")
        let suffix = String(Int(Date().timeIntervalSince1970) % 10000000)
        let phone = "+7988" + String(repeating: "0", count: max(0, 7 - suffix.count)) + suffix
        app.buttons["new-booking"].tap(); wait(app.textFields["client-search"]); app.textFields["client-search"].tap(); app.textFields["client-search"].typeText(phone); app.buttons["client-find"].tap()
        let name = app.textFields["client-name"]; reveal(name); wait(name); name.tap(); name.typeText("Тестовый клиент iPhone")
        reveal(app.buttons["client-create"]); app.buttons["client-create"].tap()
        let petButton = app.buttons["add-pet"]; reveal(petButton); wait(petButton); petButton.tap()
        wait(app.textFields["pet-name"]); app.textFields["pet-name"].tap(); app.textFields["pet-name"].typeText("Ирис iPhone")
        app.buttons["new-pet-species"].tap(); app.buttons["Собака"].firstMatch.tap()
        app.buttons["new-pet-breed"].tap(); app.buttons["Метис"].firstMatch.tap()
        reveal(app.buttons["pet-save"]); app.buttons["pet-save"].tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["pet-save"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
        reveal(app.staticTexts["Ирис iPhone"]); wait(app.staticTexts["Ирис iPhone"])
        screenshot("19-native-client-and-pet-created")
        app.buttons["Закрыть"].firstMatch.tap(); logout()
    }
}
