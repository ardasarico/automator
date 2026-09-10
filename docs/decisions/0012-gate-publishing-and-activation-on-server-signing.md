# Gate publishing and activation on the owner's server signing

Status: Accepted

## Context

A flow that moves funds (`usdc.payout`, `usdc.payment`, `onchain.transfer-token`, `onchain.write-contract`, `onchain.sign-message`, `privy.sign-transaction`) signs with the owner's Privy server wallet, which the owner must enable once. Nothing checked this before a flow went live: the first live Selfie Check test verified the visitor and then failed at the payout with an owner-only message, and the visitor learned only that something went wrong.

## Decision

- Contracts name the signer node types (`signerNodeTypes`, `findSignerNodes`, `findSigningBlockers`).
- `PATCH /flows/:id` refuses `{ enabled: true }` and `{ appPublished: true }` with 422 `invalid_flow` and one problem per signer node while the owner's wallet reports `signing !== true`; a wallet lookup that fails is 503, not a pass. Turning a flow off or unpublishing is never refused, and nothing is gated when the server has no signer at all (`canSign` false).
- The share dialog and Flow settings check the wallet first, show the warning with the enable-signing button in place, and keep the primary action disabled until signing is on; a 422 from the API is rendered as its list of problems.
- A visitor whose run fails at a signer node for a configuration reason sees "This app can't send funds right now. Its owner has to finish setting it up first." instead of the generic failure; the full error stays in the run record.

## Consequences

An owner cannot publish or activate a paying flow that would fail on its first run, and the fix is one click away in the same dialog. The check costs one wallet read per publish or activation. It covers only signing; an empty wallet still fails at run time with the existing balance error.
