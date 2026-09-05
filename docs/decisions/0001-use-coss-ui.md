# Use Coss UI as the component foundation

Status: Accepted

## Context

Automator needs a polished shared component library with its own visual identity.

## Decision

Use Coss UI as the starting point for shared components, styled with Automator's own color and typography tokens.

Keep the Coss foundation with a flatter Button finish and targeted interaction adjustments. Use Remix Icons (`@remixicon/react`) exclusively for UI icons, including imported Coss components.

## Consequences

Components live in `packages/ui` and use Base UI for behavior and accessibility. Preserve the upstream license and document local adaptations in `packages/ui/COSS.md` when refreshing registry sources.
