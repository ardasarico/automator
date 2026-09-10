# Request Selfie Check over the World ID 4.0 relying-party path

Status: Accepted

## Context

World's only ETHOnline track open to this project is Selfie Check, which asks for the credential to be used as an eligibility or abuse-prevention signal in a working app plus a written feedback document. The existing `world.id-verify` screen is a World ID 4.0 relying-party flow (signed `rp_context`, `IDKitRequestWidget`, verification on `POST /api/v4/verify/{rp_id}`). IDKit's documentation says the Selfie Check preset "currently uses World ID 3.0", which read like a second, legacy verifier would be needed.

## Decision

- `world.selfie-check` is a screen node modelled on `world.id-verify`. It asks IDKit for the `SelfieCheckLegacy` preset inside the same signed 4.0 request with `allow_legacy_proofs`; the result comes back as a 3.0 credential whose identifier is `selfie` (IDKit maps World App's older `face` name to it) and the existing v4 verifier accepts it. No legacy `/api/v2/verify` path is added.
- The verifier takes a `WorldCredential` (`device | orb | selfie`) and only a successful result of the requested credential satisfies the screen, so a `proof_of_human` result cannot stand in for a selfie.
- The screen's outputs (`verified`, `nullifierHash`, `credential`, `action`) are what a following condition needs to gate a payout, which is the "one live person, one payout" use shipped as the "Selfie-gated claim" example.
- The API's `WORLD_ENVIRONMENT` must match the World App build that visitors carry: `sandbox` for the TestFlight sandbox build, `staging` for the simulator, `production` for the store app. Production currently runs `sandbox`.
- While an IDKit request is open, the runtime swallows backdrop clicks and Escape so only the modal's close button dismisses it; a closed request stops polling and loses a proof the phone reports as completed.

## Consequences

One World ID integration serves both credentials, and the live check on 2026-09-10 (sandbox build, desktop QR, USDC payout on Base Sepolia) confirmed the path. Simulate keeps the Privy visitor in `vars`, so gated payouts resolve the visitor wallet in dry runs. The Developer Portal shows no Selfie Check status anywhere; only World App reveals at request time whether the beta is enabled, which the feedback document records.
