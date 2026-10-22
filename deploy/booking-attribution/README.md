# Источник записи из Авито — локальная подготовка

Контракт: `attribution={source:'AVITO', listingId:'8339919613'}`. Разрешены ровно два поля; listingId — положительный канонический числовой ID длиной до 20 символов. Неполные пары, чужие поля, URL, числа вместо строк и неизвестный source отбрасываются. Это заявленный источник перехода, а не подтверждение личности, согласия, цены или брони.

Добавлены nullable JSONB поля у GroomingReservation и PetHotelReservation. Legacy source остаётся CRM/CLIENT_PORTAL/OWNER_PORTAL. Метаданные записываются только при создании, сохраняются при повторе/переносе, не меняют подписанное предложение, владельца, питомца или расчёт. При переносе груминга сотрудником сохраняется также исходный legacy source. Существующие записи остаются с NULL; исторические цены и статусы не пересчитываются.

Пока только локально: миграция, API DTO/сервисы, отображение источника и тесты. Контракт сайтов/owner-gateway проверен совместно, как описано ниже; production-развёртывания это не подтверждает. Самозапись груминга не включать.

Объединённый локальный candidate 22.10.2026 находится в `codex/integration-completion-20261022`. База — финансовый выпуск/исправленная доставка Web/rollback r2 из `87418f4`, полный набор исходников установленного Avito из `8ce241e`, затем точный прайс `1127753`, ссылки объявления `39b5ff6` и клиническая атрибуция `86fb7b4`. Дополнительно `40dc744` исправляет короткое «А для другой собаки?»: прежняя порода не используется для новой собаки. Runtime финансовых модулей не меняется. Из финансовой ветки также сохранён тест печатных форм `6442793`.

Объединённые API build, Web typecheck, 65 адресных unit и 47 проверок реального PostgreSQL прошли без skip; транспорт Авито подменён. Совместная проверка с gateway `f88aba9` на двух пустых локальных БД прошла draft → claim → OPTIONS/BOOK → настоящие clinical services → сохранённый результат, повтор, перенос и переподключение. Сохранены владелец, исходный источник и ставка; 51 час — трое суток. Нет дублей, медицинских приёмов, платежей и реальных отправок MAX. Это проверка контракта и сохранения, не новая приёмка входа через MAX на физическом телефоне.

Объединение ещё не публиковалось. Для выпуска нужен отдельный согласованный packet от текущих production-образов и указателей, включая generated client и ровно эту additive migration. Новые визуальные/JTBD-правки сайтов в этот технический пакет не входят и ожидают отдельного утверждения владельца.

Проверка: отдельный PostgreSQL16, loopback127.0.0.1:15508, новая БД booking_attribution_20261022. Сначала схема из commit05c8ad4, затем старые записи с разными ставками, после — фактическая SQL-миграция. 8/8 node tests прошли без skip: ограничения пары/DTO, сохранность старых строк, настоящие owner commands обоих направлений, повтор, повторное чтение, перенос, защита владельца, отбрасывание лишних данных. Реальных клинических данных и отправок MAX нет.

Команда после отдельной подготовки пустой QA-БД на прежней схеме:

```
BOOKING_ATTRIBUTION_TEST_DATABASE_URL=postgresql://booking_attribution_qa:synthetic-attribution-only@127.0.0.1:15508/booking_attribution_20261022 node --test tests/booking-attribution.integration.test.mjs
```

Для будущего выпуска: сначала сохранить и проверить резерв; применить только additive migration; собрать совместимый Prisma client и API поверх актуальной согласованной версии, сохраняя новые Avito/финансовые исправления. Затем owner-gateway, после полной проверки bridge — публичные ссылки. Не запускать все чужие pending migrations и не собирать API со старой базы этой ветки без объединения runtime-изменений. При откате использовать предыдущие образы и сохранить новые nullable колонки/данные, без восстановления рабочей БД или DROP COLUMN. Миграция атрибуции не входит в текущий выпуск финансовых прав.

# Attribution-only packet, prepared 22 October 2026

This packet is prepare-only. The owner’s internal visual revision `114684e` and Gmail review remain separate. No host transfer, image build, backup, Apply, message, staff setup or production booking is performed by packet preparation.

Source: `f88aba9451bddfb0d3cfe52cdaa31bd48ae31e41`. Actual baseline: gateway image `339981be14103cd2ad16d26c71d93d80c058e89b0d3ca2bb5a61ea6f2ecf14fb`, mandatory clinic JS `22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e`, grooming `grooming-jtbd-20261021-r4`, hotel `pet-hotel-site-20261022-rates-r2`.

The gateway image layers only seven reviewed compiled attribution modules and one insertion in each actual live owner JS. It preserves every other distribution byte, generated client, environment, mounts, network, clinic-context fix, contacts, prices and the current closed grooming state. The full local owner JS is deliberately excluded because it contains unrelated `priceLabel` / `site-selection` drift.

The grooming baseline source is rebuilt and must match every live output byte. The candidate changes one JS bundle and the HTML reference to it. CSS, photos, catalogue, prices, copy and favicon remain unchanged. The hotel candidate changes only `app.js`, `booking.js`, a uniquely named helper, and release metadata. Existing HTML/CSS/rates/photographs remain byte-identical.

## Rollback contract

Do not restore bare `339981be` after new clients have run: its strict draft DTOs / hotel command allowlist reject the optional source. The prepared compatible rollback image keeps tolerant draft DTOs, the identical BOOK normalization/fingerprint and hotel allowlist. New draft creation reverts to baseline behavior, so newly created draft metadata may be omitted; existing drafts, sessions, booking inputs, queued operations, receipts and confirmations survive. Metadata is never identity or authorization.

Both static directions retain all old files and the new hashed grooming JS plus the unique hotel helper. An open or cached tab therefore cannot encounter a missing new asset during rollback. No asset deletion is part of this packet. A future cleanup requires separate evidence about client cache lifetime and active operations.

API coordination is mandatory: the CRM/Avito owner must use its reviewed compatible clinical consumer and rollback consumer before these producers or readers are activated. The gateway publisher does not mutate that API or its database. Root must verify the clinical packet and receipts together with this packet before Apply. Do not downgrade the clinical API to an older strict consumer while new optional attribution commands can be pending.

## Operator sequence after root review

1. Verify `checksums.json`, source/compiled diffs and `qa/receipt.json`. The QA must exercise the actual candidate and compatible payloads with isolated databases, cached new inputs, saved draft, pending BOOK, reconnect and retry. No real MAX or production record is used.
2. Root records its review in an external JSON file with `approved: true` and `packetSha256` equal to the SHA256 of this packet’s `checksums.json`. Its `clinical` object must contain `sourceManifestSha256`, `forwardReference`, `compatReference` matching `qa/clinical-dependency-binding.json`, exact `forwardImageId` / `compatImageId` values (`sha256:…`) from the API Prepare receipt, and `compatibleRollbackAccepted: true` after root verifies those consumers and replay evidence. The publisher refuses a missing clinical compatibility gate. This is a coordination gate, not a new human approval request. The visual Gmail gate is still pending.
3. Transfer this exact packet to the RU host. Run `python3 publish.py verify`, then `inspect`. Every later mode refuses missing or mismatched root review via `--review /path/to/root-review.json`.
4. With the clinical consumer/rollback acceptance confirmed, run `build`, then `backup`. These produce and verify forward plus compatible rollback images, and restore-test a fresh owner DB dump in an isolated labelled temporary container capped at 512 MiB RAM/swap, 0.5 CPU and 128 processes. Cleanup checks the task and release ownership labels. The active service and static pointers remain unchanged.
5. Root performs the final baseline review, then runs `apply` itself. The publisher atomically writes its image pin through a same-directory GUID temporary file (0600, file/directory fsync, guarded replace and cleanup), then switches the tolerant gateway first and exact static releases second, with named-service-only Compose and no Nginx reload, migration or database restore. It refuses drift in image, all distribution files, runtime configuration, service identities, Nginx and both static trees. Failures switch to the compatible rollback targets.
6. Verify external HTTPS file hashes, actual routes, preserved self-booking false, no staff/price changes, and the reviewed source journey. Real booking/MAX/device acceptance is separately owned by CRM. This local packet is not that acceptance.
7. `rollback` only accepts this exact currently applied packet, restores the compatible static/image targets, retains new asset URLs and all current database records. A later deployment or configuration drift stops rollback for review.

Rollback does not restore a database dump, erase a reservation, resend a message or rewrite a saved tariff. Backups and immutable releases are retained.

## Reproduction and evidence

Use the dedicated source worktree based on `f88`, keeping the owner’s `114` worktree intact. The prepared input directory contains a read-only live distribution/static snapshot, `baseline/baseline.json`, `compiled-forward`, `compiled-compat`, and exact baseline/candidate Vite outputs. `build-inputs.mjs INPUT` reproduces the local builds from that source; it guards source drift and always restores its temporary compatibility source edit. `prepare-packet.mjs INPUT NEW_DESTINATION` creates a new directory and refuses replacement.

`qa-run.mjs PACKET NEW_QA_RUNTIME` overlays the actual snapshot with the prepared payload, checks every resulting distribution hash, verifies both static trees over loopback HTTP, and runs real gateway/clinical services on two new empty PostgreSQL databases. The only adapter is the macOS Prisma engine path; all runtime JS and generated-client bytes retain their actual release hashes. Its private test container is label-checked and removed; existing containers are preserved. `qualify-dependency.mjs CLINICAL_PACKET QA_EVIDENCE` verifies that the qualified API payload retains the tested 36/21 compiled files and that pinned Prisma 6.19.3 formatting alone accounts for the schema hash change. It does not update an already sealed packet.

QA evidence records nine bridge groups, 302 successful HTTP asset/hash checks, both database reconnections, four synthetic grooming and four hotel reservations, no duplicate / medical appointment / payment, and zero real MAX messages. Thirteen publisher tests cover partial temp writes, file/dir fsync and replace failures, Compose validation failure with guarded byte/config recovery, refusal to overwrite a concurrent external edit, tampering, image/config/service drift, root compatibility gating, a partial static-switch failure and refusal to roll back a later configuration. Source-attribution URL/storage tests cover invalid/duplicate input, TTL and module separation. A final read-only live check confirms all 277 original gateway files, both static trees, runtime configuration, protected services and Nginx remain unchanged.
