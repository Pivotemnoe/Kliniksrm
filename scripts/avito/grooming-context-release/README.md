# Grooming context release operator

This is the generic source of the reviewed API-only publisher. The private plan supplies host/root/release/image/archive/source/account/runtime expectations plus the exact inherited `codeMounts` array (`source`, `destination`, `readOnly`, `sha256`). Keep that plan and release state outside Git.

`Prepare` runs an offline bound-base inventory proof and an offline candidate smoke/inventory proof, saves the immutable prepared evidence and leaves production unchanged. `Apply` requires the explicit reviewed candidate image and checks every binding before changing API image pins or running API-only compose. `Verify` finalizes a known healthy candidate after a lost response. `Rollback` restores only the qualified original image with the unchanged reviewed code bindings and byte-identical pins.

Run `publisher-io-qa.ps1 -PublisherPath ./publisher.ps1` on Windows PowerShell 5.1. Its fixtures replace Docker and reject actual Docker calls. It checks twenty recovery/failure cases. Actual deployment additionally requires exact file/image/state guards and complete base/candidate/runtime proofs, as recorded in `docs/releases/2026-11-02-avito-grooming-context/`.
