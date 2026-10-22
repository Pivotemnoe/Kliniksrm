# Closed grooming booking contact release

This packet updates only `dist/public/grooming.html` and `grooming.js` in the exact running owner gateway image. It preserves the live booking form, offer selection, prices, MAX handoff and history handlers byte for byte. The immutable before/candidate files, diff and hashes are in `payload/`.

The live script differs from the development checkout. Do not copy the checkout script into this packet: its unreleased price and site-selection changes are outside this release.

`prepare-context.mjs <fresh-baseline.json> <new-packet-directory>` refuses source drift and records the exact source revision. The publisher permits only these two files; it compares every other gateway distribution file and the image environment. Before switching it requires a recent database backup restored successfully into an isolated temporary container.

Only the `OWNER_GATEWAY_IMAGE` deployment pin changes. Runtime environment, other configuration, mounts and networks stay identical. PostgreSQL and backup containers, both public static trees and all available nginx configurations are guarded. Rollback restores the prior image pin and gateway container without restoring data or undoing current bookings.

Modes: `inspect`, `build`, `backup`, `apply`, `rollback`. Run only on the pinned RU host. The packet is not an approval to enable self-booking or to create appointments/messages.
