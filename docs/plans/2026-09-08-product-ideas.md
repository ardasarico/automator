# Product ideas for later development

Discussed on 2026-09-08. The user accepted these directions as ideas and deferred implementation. This note does not set a delivery order, deadline or final technical design.

## 1. Persistent data and record nodes

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

## Example combining the ideas

Collect an application → save a table record → collect payment → call a ticket-generation subflow → show the ticket. The same reusable flow could later be exposed through an API or MCP tool.
