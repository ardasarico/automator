---
name: automator-ui
description: Build or refine Automator interfaces using Coss; review usability, write UI copy, or compare visual alternatives.
---

# Automator UI

Start from the affected screen and its shared components. Preserve Coss dimensions, variants, and Base UI behavior; change established styling when the task calls for it. Use existing semantic tokens and package exports.

For component foundation changes, consult [the Coss decision](../../../docs/decisions/0001-use-coss-ui.md) and [local adaptations](../../../packages/ui/COSS.md). For typography or theme changes, consult the corresponding decision in `docs/decisions/` and the actual tokens in `packages/tailwind-config/`.

Read only the reference needed by the task:

| Task                                              | Reference                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| Layout, wrapping, typography, responsive overflow | [Layout and text](references/layout-and-text.md) |
| Keyboard, forms, focus, assistive technology      | [Accessibility](references/accessibility.md)     |
| Surface details, icons, motion                    | [Interaction polish](references/interaction.md)  |
| Labels, empty states, errors, confirmations       | [Interface copy](references/copy.md)             |
| Visual alternatives or component stress testing   | [Previews](references/previews.md)               |

For palette generation or measured contrast corrections, use [oklch-skill](../oklch-skill/SKILL.md).

Match the deliverable to the request: implement and verify a requested fix; report evidence for a review; show working alternatives for a comparison. Verify affected interactive states in the browser where available, and distinguish source inspection from rendered observations. Report concrete issues and remaining verification limits without imposing an approval verdict on ordinary implementation work.
