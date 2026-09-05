# Design QA · TemichevVET 24/7

Date: 2026-09-05. final result: passed

Scope: local design implementation and browser behaviour. This is not production acceptance or a claim that the CRM migrations have been applied.

## Visual truth and normalization

- Selected source: `/Users/konstantin/Documents/CRM/outputs/temichevvet-design-directions-2026-09-05/preview/c-hero.png` (1440×1024), `c-desktop.png` (1440×2356), `c-mobile-hero.png` (390×844), `c-mobile.png` (390×2708).
- Implementation captured at http://127.0.0.1:4190/ ; final preview moved to http://127.0.0.1:4192/ because 4190 is a restricted port in standard Fetch implementations. Same build; screenshots in this project's `output/playwright`.
- Desktop: CSS viewport 1440×1024, devicePixelRatio 1; `home-desktop.png` is 1440×1024. Mobile: CSS 390×844, DPR 1; `home-mobile.png` is 390×844. Equal-sized source/implementation panels in `comparison-desktop.png` (2880×1024) and `comparison-mobile.png` (780×844). No device bezel. Source left, implementation right. These combined inputs were opened and visually inspected together.
- Full implementation: `home-desktop-full.png` 1440×4064, `home-mobile-full.png` 390×4742. The longer length is intentional: the selected hero/route/services foundation now includes the requested clinic/doctor/visit/reviews content rather than design-explanation placeholders. It is not a same-content pixel diff with the shorter original.
- Initial IAB `fullPage:true` output had blank areas and repeated raster strips. This was a capture defect: DOM width, H1 count and viewport captures were correct. Those raw internal-page full-page images are not acceptance evidence. The home full-page files were replaced with normal viewport captures at measured scroll positions, composed by `scripts/stitch-qa.mjs`. Exact capture positions are in `home-slices.json` / `home-mobile-slices.json`; `home-slice-0..3.png` were inspected individually. The final fixed mobile action bar is included once; intermediate bar regions are excluded during stitching.
- Reliable internal-page evidence: `*-desktop.png` and final `*-mobile.png` are viewport captures; `pages-desktop-board.png` is the contact sheet of all 16 desktop pages. Loaded Yandex evidence: `reviews-live-mobile-viewport.png`, `reviews-live-mobile-detail.png`, and the observed iframe DOM. Older files containing `reviews-live-*-full` or `reviews-live-mobile.png` came from the problematic automatic stitch and are not used to claim fidelity.

## Comparison history

### Pass 1 — blocked

- [P2] Desktop 24/7 indicator was too low, with excess space before the address. `home-desktop-before.png` compared with `c-hero.png`: the large number used a block line-height of 1.35, shifting the whole right-hand rhythm. Fix: restore source-like inline line box, font weight 450, line-height 1, letter spacing −0.09em, 12px top padding and 35px address gap.
- [Capture blocker] Automatic full-page screenshots could not be accepted because their stitched pixels did not match the actual viewport geometry. Fix: use measured viewport slices; no page CSS was changed to compensate for a screenshot bug.

### Pass 2 — passed

- `home-desktop.png` and `comparison-desktop.png`: 24/7 position and address rhythm corrected. Typography-led hero, two-column balance, facade placement, core headline wrapping and primary action preserved. Additional Prices and Reviews header links are intentional user-requested destinations.
- `home-mobile.png` and `comparison-mobile.png`: same two-line 44px main heading, stacked primary/secondary actions, facade immediately after the dark section. The mobile persistent call/visit/route bar is an intentional working-site addition, not source drift. Page bottom padding includes device safe-area inset.
- Full-page sequence: no repeated content in actual DOM or normal viewport screenshots; sections have clear boundaries, alternating neutral surfaces, consistent margins and image scale.
- Internal-page contact sheet: titles, breadcrumbs, layouts and service grouping are consistent, with no generic stock art or fake doctor cards. Text-only service heroes are deliberate where a relevant real photograph is missing.

## Required fidelity surfaces

1. **Fonts and typography.** Local Manrope variable files, weights 500 display/650 controls/700 eyebrow, navy wordmark matching source text treatment. Desktop hero 76px, mobile 44px, source-like tracking and wrapping. Internal long names wrap without clipping. Source Chromium captures and IAB captures have visible rasterization/color-profile differences; no font-family substitution was made. Header/menu focus state was separately checked, then a neutral mobile capture was taken for the comparison.
2. **Spacing and layout rhythm.** Desktop margin 64px, mobile 24px, header 104/78px, 1.8:1 hero grid and 55px gap, facade grid 1.16:1 and 70px gap. Minor approximately 5–11px vertical differences in hero height versus the original raster remain P3; they do not change wrapping, ordering or core CTA visibility. Added sections are intentionally more extensive than the concept.
3. **Colors and tokens.** Navy `#122a3a`, lime `#d2e5ae`, cool `#edf1f4`, warm `#f7f5f0`. Strong dark/light separation and restrained rules, not card-heavy styling. Text and visible focus are distinct from backgrounds. This is a practical visual/accessibility pass, not a full certified WCAG contrast audit.
4. **Images and assets.** Existing facade, doctor-with-cat, ultrasound, laboratory, inpatient room and reception photographs only. Responsive WebP derivatives, no generative modification. Real photos used in relevant sections. Missing team/operating-room/radiography photos listed in a separate reviewer-only photo plan. No fabricated portraits or apparatus. Existing original files preserved.
5. **Copy and content.** Main selected headline preserved. Explanatory mock labels removed from public content; demo warning remains only where the form really is a demo. No fabricated prices, names of other staff, review authors or numeric ratings. Service descriptions distinguish a first visit, preparation and price enquiry; they do not diagnose animals. Facts and new draft copy still need clinic-side approval before publication.

## Interactions and responsive checks

- All 16 routes: 1440×1024 and 390×844; one H1, no horizontal overflow or broken images. Results: `route-checks.json`.
- Home, diagnostics, doctor, prices, visit and reviews: also 320/768/1024px; no horizontal overflow. Results: `responsive-checks.json`.
- Mobile menu opens, navigation visible, Escape closes and restores the button state.
- Checklist toggles and updates its count; FAQ expands with the intended answer.
- Form: name/phone and unchecked-by-default consent; a synthetic submit returns an explicit local-demo confirmation, not a booked appointment. No live inquiry was sent.
- Synthetic catalog browser test: 1000→1500 ₽ without reload, range price, search, no-result/reset, removal after archive, stale state with zero displayed rows. Source code uses real export/gateway services with an in-memory persistence double. Browser prices are not the clinic's prices.
- Yandex iframe genuinely loaded organization 1809394242 and its reviews. No request to Yandex before the load button; source link stays available if the widget fails.
- Application console logs checked: no errors/warnings on the tested local routes; external widget loaded without reported errors in the inspected tab.
- Static pages, unique metadata, internal links and fallback/packaging tests: 7/7. CRM suite: 287/287. API, gateway and CRM web typecheck pass.
- Final 4192 server: HTTP 200 for home, prices and diagnostics; HTTP 404 for an unknown URL. Old 4190 preview and synthetic 4191 harness stopped after verification. Delivered tab uses 4192; temporary viewport override reset to normal 1440×1024.

## Open questions and release gates

- Confirm final copy/facts, staff roster/portraits, publication selection for prices, operator details/privacy notice.
- Apply and validate the two migrations on the chosen real PostgreSQL instances and verify actual CRM→gateway→site deployment. No such deployment occurred in this task.
- Verify real iOS/Android, production TLS/CORS/CSP, trusted proxy rate limiting, real request delivery, approved analytics, and production 404 configuration.
- Keep `/photo-plan` out of the public release. Sites scaffold worker is intact and still has SPA fallback; do not call Sites production 404 handling complete.

## Implementation checklist

- [x] Correct the 24/7 source mismatch and recapture.
- [x] Compare desktop/mobile source and implementation together.
- [x] Inspect full homepage and all page families at readable scale.
- [x] Verify menu, form demo, checklist, FAQ, catalog states and live review widget.
- [x] Preserve actual photographs and separate the missing-photo plan.
- [x] Leave production services/databases untouched; record release instructions.

## Follow-up polish

P3: remove the remaining small vertical metric differences if exact raster parity across browser engines is later required; replace missing team and equipment photography after a real shoot; clinic editor to approve the draft copy. These are not blockers for reviewing the implemented local direction.

final result: passed
# Production acceptance, 2026-09-05

Published to https://clinic.temichevvet.ru/ . Real CRM catalog (272 reviewed services), Yandex widget, all 16 desktop/mobile routes accepted. Five incomplete photo sections visibly say «РАЗДЕЛ В РАЗРАБОТКЕ». Public forms remain contact-only pending the approved privacy document; analytics is not enabled. Evidence and exact limitations: `../../docs/product/CLINIC_SITE_RELEASE_2026_09_05_RU.md`. Earlier sections below describe the pre-publication review.
