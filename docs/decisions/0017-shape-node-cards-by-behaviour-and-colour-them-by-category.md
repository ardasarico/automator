# Shape node cards by behaviour and colour them by category

Status: Accepted

## Context

The first node card showed a category eyebrow, an icon tile and a port row per port, so every one of the 46 types looked the same and a flow could not be read without opening its nodes. Arda wanted the card to say what a node is set to do, and asked whether triggers, and then other kinds of node, should look different. Designing one card per type would have meant 46 designs to keep consistent; designing none leaves a canvas where a trigger, a screen and a payment are the same rectangle.

## Decision

- **Every card carries a summary line** under its title: what the node is set to do, in words ("collect 5 USDC", "input.amount ≥ 10", "when someone opens the app"). The rule per type lives in contracts (`describeNode`), next to the trigger sentences the flow lists already use, so the canvas, the lists and later the API describe a node the same way. A type with no rule shows its catalog description, never a blank.
- **Shape follows behaviour, in four families, and no more.** A **trigger** is a card washed in its colour with a "Trigger" tag and nothing entering it. A **screen** keeps the title bar and lists what the visitor gets. A **branch** (condition, switch, filter) puts the question in the middle and its outputs as tabs the wires leave from. Everything else is a **step**: title bar, summary, ports. A fifth family needs a reason as strong as these three have; a type never gets a shape of its own.
- **Colour stays with the category.** The category tint on the title bar, and on a trigger's whole card, is the only colour a card carries. Run status and problem badges keep their own semantic colours.

## Consequences

A flow reads from the canvas alone, and the same words describe a node wherever it appears. Adding a node type means writing one summary rule and, only when it is a trigger, a screen or a choice, joining an existing family; it never means designing a card. The canvas holds four silhouettes, which is enough to tell start, screen, question and action apart at 25 % zoom and few enough that they stay recognisable.
