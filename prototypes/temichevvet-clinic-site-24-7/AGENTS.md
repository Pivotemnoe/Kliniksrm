# Prototype Instructions

## Selected direction (2026-09-05)

Use direction C / 24-7 from `outputs/temichevvet-design-directions-2026-09-05`, not an older concept with the same number. Navy, lime, Manrope, a typographic hero, then the real facade for navigation. Direction A may influence warm clinic/doctor sections, but must not replace C. Use only existing real photos; keep missing team/equipment photography in a separate photo plan. Include opt-in CRM-synced public prices and official Yandex Maps reviews. This is a local implementation; production deployment requires a separate exact-target approval.

User approved publication to the existing clinic.temichevvet.ru on 2026-09-05, including CRM price integration. Publish active clinical services except internal/test entries and zero prices. Do not change CRM prices as part of publication.

Public unfinished sections must say «РАЗДЕЛ В РАЗРАБОТКЕ», not «здесь будут фотографии» or other production notes. Keep ready pages usable and distinguish unfinished site content from clinic operations. The private photo plan must remain inaccessible on the public build, including client-side routing.

User correction (2026-09-05): show existing TemichevVET image logos in the header and footer. Keep the main header/navigation visible during scrolling on desktop and mobile. Embed official Yandex reviews automatically on the home and reviews pages, with optional Maps links, not a load/open-browser gate. Remove developer-facing explanations from public copy; retain the explicitly requested unfinished-section labels.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
