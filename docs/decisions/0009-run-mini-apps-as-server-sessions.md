# Run mini-apps as server sessions

Status: Accepted, extended by [0014](0014-collect-visitor-usdc-payments-as-a-verified-screen.md)

## Context

A mini-app is a flow that starts with `trigger.miniapp-open` and moves a visitor through `screen.*` nodes. The first version ran the whole flow in the visitor's browser, which exposed node config (including webhook URLs) to anyone who opened the link and could not use the owner's secrets or wallet. Publishing also has to stay a simple link with no visitor accounts.

## Decision

- A published mini-app runs on the API as a session: `POST /public/flows/:id/sessions` runs the flow as its owner (with the owner's secrets and chain access) from the trigger to the first screen and answers a session id, a one-time token and only the current screen; `POST …/sessions/:sessionId/answer` resumes the run with the visitor's port and data and answers the next screen, `end`, or a visitor-safe failure. The document never leaves the API; each step is stored as a run with source `miniapp`. Sessions live in `automator_sessions`, keyed by a token hash.
- The runtime app (`/a/[flowId]`) renders the session through its own same-origin handlers, edge to edge on phones and as a phone-sized card elsewhere. Publishing is the owner's consent: sessions run whether or not the flow's unattended triggers are enabled.
- The in-browser engine survives only for the owner's own preview: an unpublished flow, or any flow with `?preview`, plays a document the builder's "Open in browser" link hands to that exact window by `postMessage` after origin, opener and nonce checks, with secrets unresolved. Only a random nonce enters the URL fragment, so a copied link cannot recover the document.
- The runtime's landing page explains what a link is and lists nothing; discovery belongs to the marketplace.

## Consequences

Visitors see screens, never config or secrets, and owner-side capabilities (Discord, Telegram, email, onchain) work from a shared link. Every visitor step costs an API run and a stored record, which is acceptable at hackathon scale. A resumable session means a screen answer is replayable by anyone holding the token, so tokens are one-time and hashed. The mini-app is a plain web page that also works inside World App, where the runtime installs MiniKit on load so a World ID request completes natively. A session also carries screens the API prepares rather than merely serves: the three identity screens, and the visitor USDC payment of 0014.
