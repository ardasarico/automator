# Share color tokens across light and dark themes

Status: Accepted

## Context

Both the builder and runtime need light and dark appearances with a consistent identity.

## Decision

Use next-themes with system, light, and dark selection in both frontends. Keep shared OKLCH colors in `packages/tailwind-config/colors.css`.

Use cool blue/cyan neutrals adapted from the personal website palette, with a darker canvas in dark mode. Primary blue is #00CEFF. Blue, green, amber, and red each have five fixed steps, while neutral roles invert between themes.

## Consequences

Components consume semantic tokens instead of defining independent theme palettes. Status surfaces pair step 100 with foreground 400 in light mode and step 500 with foreground 200 in dark mode. Status foreground tokens are for these tinted surfaces, not guaranteed text colors on solid step-300 fills; verify solid variants when adding components.
