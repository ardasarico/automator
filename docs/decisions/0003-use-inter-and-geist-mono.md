# Use Inter and Geist Mono with a 15 px body scale

Status: Accepted

## Context

Automator needs readable interface text and clearly distinguishable addresses, code, and numbers at small sizes.

## Decision

Use locally hosted Inter for interface text and Geist Mono for code, identifiers, and numeric data. Define semantic typography roles in `packages/tailwind-config/typography.css`.

| Role    | Size / line height | Weight |
| ------- | ------------------ | ------ |
| Page    | 30 / 33 px         | 500    |
| Panel   | 24 / 29 px         | 500    |
| Section | 18 / 24 px         | 500    |
| Body    | 15 / 23 px         | 400    |
| Label   | 15 / 21 px         | 500    |
| Caption | 13 / 20 px         | 400    |
| Code    | 13 / 20 px         | 400    |

## Consequences

All line heights resolve to whole pixels at the default root size. Tokens use rem so user font-size preferences still scale the interface. Prominent numeric values use Geist Mono at body size with tabular figures. Font selection and the base scale are settled; component-specific behavior will be validated during component integration.
