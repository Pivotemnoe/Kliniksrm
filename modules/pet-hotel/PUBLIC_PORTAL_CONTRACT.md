# Hotel website / owner gateway / clinic bridge — local v1

Coordination: website and gateway are owned by this chat in `pet-hotel-site-20261020`; clinic API, CRM, rates and delivery outbox are owned by the authorized CRM redesign chat. No production changes. The old 4291/4292 and accepted 4261–4264 stands stay untouched.

## Integration baseline — CRM handoff on 20.10.2026

The authorized CRM chat reports grooming release `crm-grooming-independent-20261020-r1` on API/Web and RU owner gateway, full revision `908cbbdd0aae9e302fc9b7ed5cc56de00804436d`, branch `codex/grooming-production-20261020`. Its base is the current Avito revision `ccaea00f1de24eafeb86fb6df8f735714c95c6e5`. The commit and workplace-aware grooming source were verified locally; this document is not an independent live deployment acceptance report.

Continue hotel integration from that baseline (or a newly verified later revision). Do not deploy this older hotel checkout over it. Local hotel implementation `19c04ea0bb4661ffc0c3660789815a2f40c5969e` is an integration candidate; merge/cherry-pick its additions while preserving current Avito, grooming and shared MAX behavior. In particular, retain public grooming `shift.workplaceId` and availability matching the assigned workplace, including the legacy null fallback. Resolve shared AppModule/MAX webhook/Prisma changes as additions, never by replacing the newer files wholesale.

The grooming release freeze is lifted, but hotel deployment remains unauthorized. The CRM chat will resume the actual hotel processor connection separately after the human reviews grooming. The local read-only hotel fixture stays unchanged and is not evidence of a saved clinical booking or MAX delivery.

## Gateway internal endpoints

All use `x-owner-gateway-secret: OWNER_GATEWAY_SYNC_SECRET`, no employee token.
Base: `/internal/v1/pet-hotel/portal`.

- `POST /storefront` body `{payload}`. Payload:
  `{schemaVersion:1,capturedAt:ISO,enabled:boolean,selfBookingEnabled:boolean,testMode:boolean,settings,rooms,busy}`.
  Settings: `{dailyRate,walkRate,minimumDays,maximumDogWeightKg,checkInFrom,checkInTo}`. Rates are decimal RUB strings, times HH:mm Moscow.
  Rooms: `{id,code,name,species:'CAT'|'DOG',dailyRate,isActive,version,sortOrder}`. Null room rate falls back to settings.dailyRate. No client/pet/employee data.
  Busy: `{roomId,startsAt:ISO,endsAt:ISO,status:'CONFIRMED'|'IN_HOUSE'}`. Include overdue IN_HOUSE stays: they block a room until checkout.
- `GET /operations` → `{items:[{id,ownerId,clientKey,kind,input,expiresAt,...}]}`.
- `POST /operations/:id/result` body `{status:'DONE'|'FAILED',result?:object,error?:string}`. Results persist and repeated identical completion is accepted.
- `GET /registrations` → `{items:[{id,maxUserId,input:{knownOwnerId?,fullName?,phone?}}]}`.
- `POST /registrations/:id/result` body `{result}` or `{error}`. Result: `{status:'NEEDS_DETAILS'|'REVIEW_REQUIRED',message?}` or `{ownerId,displayName,owner,animals}`.

Registration uses shared Owner/MessengerBinding/PortalSession identity. It does not require GROOMING or import its services. Only a verified MAX payload can bind a browser registration. A phone number alone must not grant an existing owner's identity. Browser registration tokens are HttpOnly cookies, database stores hashes.

## Owner operations

`GET /v1/portal/pet-hotel/session` returns `{ownerKey}` after validating the shared session. The browser scopes recovery of uncertain commands to this non-secret owner fingerprint; switching owners must discard local pending recovery.

`POST /v1/portal/pet-hotel/operations` accepts `{clientKey,kind,input}` using the shared owner session cookie. Returns `{id,kind,status:'PENDING'|'DONE'|'FAILED',result,error}`. Poll `GET /operations/:id` or recover `/operations/by-key/:clientKey`. Owner identity comes exclusively from the gateway session; input ownerId/rates are rejected.

- STATE `{}` → `{owner:{fullName},animals:[{id,nickname,species,breed?,weightKg?}],bookings:[booking],settings,selfBookingEnabled,mode?:'qa',qaDelivery?:'intercepted',bridgeReady?:false}`.
- OPTIONS `{animalId,species,startsAt,endsAt,weightKg?,walkCount,reservationId?}` → `{rooms:[offer],notice?,enabled}`. The clinic verifies pet ownership and applies its current room rates. Ignore an existing reservation only after verifying it belongs to this owner.
- BOOK `{animalId,offerToken,notes,contactConsent:true,bookingConsent:true}` → booking.
- RESCHEDULE same + `{reservationId,version}` → booking. Preserve the existing booking tariff snapshot; do not silently apply a new room rate to an old booking.
- CANCEL `{reservationId,version}` → booking.
- PET_CREATE `{nickname,species,breed?,weightKg?}` → pet. Reuse the shared owner/pet model; no hotel duplicate identities.

Offer: `{id,code,name,species,quote,offerToken,expiresAt}`. For owner OPTIONS its offerToken is issued and validated by the CLINIC, bound to this owner/pet/dates and price snapshot. Public gateway offers below are not booking authority.

Quote: `{billableDays,dailyRate,walkRate,stayPrice,walksPrice,totalPrice}`. Money is decimal RUB strings, calculated in cents on server. Partial days round up; minimum actual duration applies before rounding.

Booking: `{id,version,status,animalId,animal:{nickname},roomId,room:{name},startsAt,endsAt,walkCount,dailyRate,walkRate,billableDays,totalPrice,notes?,canCancel?,canReschedule?}`. Status: CONFIRMED / IN_HOUSE / CHECKED_OUT / CANCELLED / NO_SHOW. The clinic must filter every record to ownerId and return no other owners' records.

Use gateway operation `id` as the clinic command idempotency key. Check for an existing command receipt BEFORE checking expiry or disabled-module guards. An expired unprocessed mutation must fail without creating a reservation; a previously committed mutation must return its receipt even after expiry/disabling. This is required for safe recovery after a lost response.

## Public website

- GET `/v1/public/pet-hotel/catalog` returns sanitized current settings/room rates and connection/freshness/capability flags. No busy list, client IDs or personal records.
- GET `/v1/public/pet-hotel/availability?species=CAT&startsAt=...&endsAt=...&walkCount=0` returns `{enabled,rooms:[offer],asOf,version,testMode,notice}`. Rates come from the chosen room. Unfresh snapshot (90s) fails closed. Gateway public offer tokens last 5 minutes, store only selection/quote preferences.
- POST `/v1/public/pet-hotel/drafts` body `{offerToken}` checks the selected room and current tariff again, then returns `{token,expiresAt}`. The public site transfers this opaque 15-minute token in `/portal/pet-hotel#draft=...`.
- Authenticated POST `/v1/portal/pet-hotel/draft` body `{token}` claims it for one owner and returns the saved selection/quote. The portal requests clinic OPTIONS again; a site draft never creates a reservation.

Changes and confirmations/reminders go through the clinic-owned MAX outbox. The gateway queue and browser never claim a message was delivered merely because a reservation was saved. Live MAX and production are not part of local QA.

## Local preview boundary

`node scripts/pet-hotel-gateway-preview.mjs --fixture-readonly` starts an isolated loopback-only fixture on 4313 with allowlisted synthetic database `pet_hotel_gateway_preview_20261020_qa`. It implements STATE/OPTIONS contract responses, sets `bridgeReady:false`, and cannot create or change real bookings or deliver MAX. Browser and HTTP evidence from this fixture is gateway/frontend evidence, not clinical booking acceptance. The real clinic processor and its idempotency receipts must be tested separately before self-booking can be released.
