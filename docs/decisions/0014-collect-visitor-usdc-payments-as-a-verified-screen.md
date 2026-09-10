# Collect visitor USDC payments as a screen verified server-side

Status: Accepted

## Context

Every funds node moved money _out_ of the owner's wallet: `usdc.payout` and the onchain writes all sign with the owner's Privy server wallet, which is what decision 0012 gates publishing on. Nothing let a mini app take money _in_, so a flow could not sell anything. A visitor pays from their own wallet in their own browser, which means the browser is the one place the answer cannot be trusted: it chooses the amount it sends, the recipient it sends to, and what it claims afterwards.

## Decision

- `usdc.payment` is a screen, not a step. It pauses the run the way `screen.form` and the identity screens do, with ports `paid` and `declined`; both branches carry `paid`, so one `logic.condition` reads either outcome.
- The API prepares the screen rather than merely serving it: it resolves the chain, the token, the recipient and the amount in units server-side and sends them as `MiniAppScreen.payment`, so the browser signs numbers it did not derive. A screen whose payment cannot be resolved fails that node instead of asking the visitor for something undefined.
- On the answer the API recomputes the recipient and the units from the stored document, waits for the receipt, and accepts only a successful one carrying exactly one USDC transfer of that amount, to that recipient, from the wallet of the Privy user whose token came with the answer. The browser's claim is evidence to check, never the record.
- A transfer answers exactly one screen. The payment row and the screen claim are written in one transaction (`sessions.claimWithPayment`, `automator_payments`, migration `0018_payments`, unique on `(chain_id, tx_hash)`), which is what makes replay impossible rather than merely unlikely.
- A rejected answer never ends the session: `payment_pending`, `payment_used` and `payment_rejected` each come back as a notice above the same screen, so a visitor whose receipt has not landed can wait and pay again.
- `usdc.payment` leaves `signerNodeTypes`. The visitor signs, not the owner, so a flow whose only funds node is a payment publishes and activates with server signing off — narrowing the gate decision 0012 introduced to the nodes that genuinely need it.
- Money the owner _receives_ is kept apart from the tables that bound what the owner _sends_ (`automator_payment_policies`, `automator_payment_reservations`); a visitor payment never touches them.

## Consequences

A mini app can charge for what it does, and the owner's signing setup is not a precondition for taking money. Verification costs a receipt wait per answer, so a payment screen is slower than a form. The visitor needs the chain's native coin for gas: Privy's embedded wallets cannot sponsor it on this path, and gas sponsorship is not built. Simulate and dry runs auto-answer with a sample transfer marked `simulated`, so an author can build the flow without spending anything.
