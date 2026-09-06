---
name: oklch-skill
description: Adjust Automator color tokens, generate palette alternatives, convert colors, or measure contrast and gamut.
---

# Automator colors

Read [the theme decision](../../../docs/decisions/0002-share-color-and-theme-tokens.md) and `packages/tailwind-config/colors.css` for token changes. Preserve semantic roles and the existing relationship between neutral and chromatic scales unless the user is revisiting them.

- For conversion, palette generation, or Tailwind integration, read [color and theme work](references/color-and-theme.md).
- For a contrast failure or accessibility assessment, read [contrast measurement](references/contrast.md).

Change the requested colors and dependent roles needed for a coherent result. Show visual alternatives in light and dark mode for palette decisions, using UI Lab or the relevant app. Report changed tokens and measured pairs; distinguish numeric verification from visual judgment.
