# Product ideas for later development

Discussed on 2026-09-08. The user accepted these directions as ideas and deferred implementation. This note does not set a delivery order, deadline or final technical design.

> **Status on 2026-09-10:** idea 1 shipped (`2a28fdf`), ideas 5 and 6 followed (`6bf9935`, the shortlist minus the deprioritized run-output inspector), idea 3 shipped on 2026-09-10 as flows published over HTTP and MCP (merges `d13044b` and `f4885c6`, decision [0013](../decisions/0013-publish-flows-as-an-api-and-as-mcp-tools.md)), and idea 4 shipped the same day as the visitor USDC payment screen (merge `9375e1d`, decision [0014](../decisions/0014-collect-visitor-usdc-payments-as-a-verified-screen.md)). Only idea 2, reusable subflows, remains open.

## 1. Persistent data and record nodes

Implemented on 2026-09-08.

Add a separate workspace section where users create tables, define columns and manage records. `Data` is a suggested name; `Database` or another label remains an option.

Flows can create, find, update and delete records through nodes. Multiple flows can use the same table. Example records include applications, orders, tickets, inventory and customers.

Suggested nodes: `Create record`, `Find records`, `Update record`, `Delete record`. Storage details and the initial column types remain to be designed.

## 2. Reusable subflows

Let a flow expose defined inputs and outputs so another flow can call it as a single node. Reuse common operations such as verification, payment distribution, ticket generation and notifications.

The user explicitly wants to develop this later. Execution and editing details remain open.

## 3. Publish flows as API or MCP tools

Let websites, backends and AI assistants call a flow through a published interface with defined inputs and outputs. This was already part of the user's plans.

The input/output definitions used for subflows could also support these interfaces. Publication controls and access management remain to be designed.

## 4. Visitor payments for paid mini-apps

Complete the payment experience needed for use cases such as paying USDC to generate a report or purchase a ticket.

Current implementation, checked on 2026-09-08:

- `usdc.payment` and `usdc.payout` both send funds through the current chain signer. Published mini-app sessions use the flow owner's wallet; visitor login does not switch the payer.
- Onchain event triggers can detect incoming transfers and start a new run, but do not match a payment to a waiting visitor session and resume it.
- Server-enforced outgoing payment limits already exist and are separate from visitor checkout.

The missing experience is: show the visitor a payment request, let them pay from their wallet, verify the expected transfer for that order/session on the server, and continue the flow. Verification must prevent reuse of the same payment for another purchase.

A proposed node distinction is to complete `USDC payment` as visitor payment collection and retain `USDC payout` for outgoing distribution. This is a future design proposal; existing node behavior has not been changed.

Implementation references: `packages/flow-engine/src/onchain-executors.ts`, `apps/api/src/sessions/routes.ts`, `apps/runtime/src/app/a/[flowId]/identity-host.tsx`, and `apps/api/src/scheduler.ts`.

## 5. Share mini-apps without a Marketplace listing

Implemented on 2026-09-08: `automator_flows.app_published` gates the public read, `PATCH /flows/:id` `{ appPublished }` toggles it, and the builder's Share menu offers the app link and the marketplace listing as separate choices. Accepted by the user on 2026-09-08.

Users must be able to publish a mini-app and share its link without listing the flow in the Marketplace. Publishing a runnable app and listing a reusable flow in the Marketplace are separate choices; sharing a link must not automatically create a listing.

The current implementation gates published mini-app access on the existence of a Marketplace listing. Decouple that requirement while preserving the API-owned execution model.

An unlisted link is not an access-control guarantee. Authentication requirements, user or wallet allowlists, link expiry and other sharing controls remain undecided.

## 6. Quality-of-life shortlist

Implemented on 2026-09-08, as the proposed details below describe: the connect-drop node picker, last-run values beside each configuration field, inline Data cell editing, saved nodes and the ⌘K command menu. The run-output inspector stays deprioritized.

User feedback on 2026-09-08 narrows the discussion to everyday editing convenience. These statuses describe product interest, not a finalized implementation design or delivery schedule.

| Idea                                                               | User feedback                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Add a connected node by dragging an output into empty canvas space | Supported.                                                              |
| Show a variable's last-run value beside its configuration field    | Explicitly requested for inclusion.                                     |
| Edit Data values directly in table cells                           | Candidate; the user wants the interaction explained before settling it. |
| Improve the run-output inspector                                   | Deprioritized because that area is already due to change.               |
| Save configured nodes for reuse                                    | Candidate; the user emphasizes doing it properly.                       |
| A single command menu                                              | Candidate with positive feedback.                                       |

Proposed details, pending user agreement:

- Variable previews identify the source run and distinguish missing values from `0`, `false` and empty text. Changed flow configuration makes previous-run evidence stale. Secrets stay masked.
- Inline Data editing uses editors matched to existing column types, keyboard save/cancel/navigation, and visible pending/error states that preserve the draft. A cell update must preserve other columns and detect conflicting edits; the current record update replaces the full values object. Multi-cell paste is a later extension.
- Saved nodes are private configuration presets that insert independent copies. They retain secret references rather than secret values, identify missing table/column/input dependencies when inserted, and do not update existing copies when a preset changes. Start with one node per preset; reusable subflows remain a separate idea.

## Example combining the ideas

Collect an application → save a table record → collect payment → call a ticket-generation subflow → show the ticket. The same reusable flow could later be exposed through an API or MCP tool.
