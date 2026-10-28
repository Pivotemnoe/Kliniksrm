# Нативные уведомления iPhone

## Реализовано

Клиент использует настоящий `UIApplicationDelegate`, `UNUserNotificationCenterDelegate` и `registerForRemoteNotifications`. В профиле пользователь включает уведомления. Сначала проверяется общий `/v1/staff-app/native-push/config?platform=IOS&applicationId=ru.temichevvet.staff`; при недоступной настройке разрешение не запрашивается и подключение не изображается. Token отправляется только после callback ОС. Подтверждение регистрации API не называется доставкой.

Installation ID и квитанция находятся в Keychain, раздельно по серверу и сотруднику. Отключение удаляет собственную регистрацию. При выходе выполняются удаление регистрации и logout. Если CRM не отвечает, клиент сообщает, что прекращение сеанса не подтверждено; доверие можно отозвать в CRM.

Единый контракт с Android и CRM сохранён в `ServerAdapter/shared-chat/docs/mobile/STAFF_CHAT_API.md`. Собственного протокола/копии истории у iOS нет.

| Путь относительно `/api/v1/staff-app` | Использование |
| --- | --- |
| `GET /native-push/config?platform=IOS&applicationId=…` | Provider APNS, bundle ID, среда, доступность |
| `POST /native-push/devices` | installationId, platform IOS, applicationId, token, environment SANDBOX/PRODUCTION |
| `DELETE /native-push/devices/:id` | Отзыв собственной регистрации |
| `GET /native-push/events/:id` | Подтверждение получателя и назначения перехода после входа |

`INTERNAL_MESSAGE` открывает конкретный личный диалог; `CLINIC_CHAT` — подтверждённый общий канал; `GROOMING` — события записей. ID назначения из payload не считается доверенным: сначала читается собственное событие API. Чужое событие не открывает экран. После истечения сессии сохраняется только непрозрачный event ID, переход выполняется после входа. Само уведомление не отправляет read receipt.

Foreground delegate подавляет дубликат event ID и показывает системный banner с общим текстом. Если APNs не подключён, видимое приложение обновляет сообщения пассивными GET и показывает внутренние оповещения/непрочитанные. Опрос прекращается в фоне и не называется фоновой доставкой push.

## Серверный адаптер

В общем снимке есть настоящий HTTP/2 APNs transport: `ServerAdapter/shared-chat/apps/api/src/modules/staff-native-push/native-push-transport.ts`. ES256 JWT, раздельные sandbox/production hosts, topic приложения, delivery ID и общий текст. Тела переписки, имена, телефоны и медицинские сведения в payload не передаются.

Transactional outbox создаёт событие каждого сообщения от любого сотрудника. В общем канале — отдельное событие каждому другому участнику; автор исключён. Доставка уникальна на event/device. Перед отправкой повторно проверяются права, уведомления, сотрудник, grant, отзыв удалённого доверия и персональное прочтение. Неопределённый ответ — UNKNOWN без автоматического повторения; ACCEPTED означает принятие провайдером, не показ на телефоне.

Снимок с SHA-256 и исходной базой: `ServerAdapter/shared-chat/manifest.json`. Он компилируется только в `QA/.generated/backend`. Основные `apps/api/src`, `prisma/schema.prisma`, чужая ветка и рабочая БД не изменяются. Это локальный интеграционный кандидат; общим серверным контрактом владеет Android-чат.

## Необходимые внешние настройки

1. Подтвердить App ID `ru.temichevvet.staff`, команду и отдельное назначение приложения сотрудников. Apple-профили/ключи других приложений не применялись.
2. Push Notifications capability и provisioning с aps-environment. Собственные Debug/Release entitlements подготовлены (development/production); физическая подпись не настроена.
3. На согласованном сервере развернуть общий API/миграции. Настроить `STAFF_NATIVE_PUSH_ENABLED`, `STAFF_NATIVE_PUSH_IOS_BUNDLE_IDS`, `STAFF_NATIVE_PUSH_ENCRYPTION_KEY_B64`, `STAFF_NATIVE_PUSH_APNS_TEAM_ID`, `STAFF_NATIVE_PUSH_APNS_KEY_ID`, `STAFF_NATIVE_PUSH_APNS_KEY_PATH`, `STAFF_NATIVE_PUSH_APNS_ENVIRONMENT`. Ключ .p8 хранить только на сервере с проверенными environment/topic scope.
4. Отдельно разрешённая подписанная установка и приёмка настоящего iPhone. TestFlight/App Store и рабочую установку этот чат не выполняет.

## Доставка ещё не принята

Для подтверждения нужны настоящее разрешение iPhone, token ОС, регистрация API, APNs receipt и фактическое оповещение при блокировке/закрытом процессе. Отдельно принять нажатие в личный/общий чат, двух получателей с независимым прочтением, истёкшую сессию, отключение уведомлений и отзыв устройства.

В локальной QA внешняя доставка выключена. Проверки маршрутизации не заменяют доставку. simctl push, локальные уведомления и поддельные provider receipts как доказательство доставки не применялись.

Документация Apple проверена 28 октября 2026: [регистрация APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns), [authentication tokens](https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens/), [scope ключей](https://developer.apple.com/help/account/keys/create-a-private-key/), [APNs requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).
