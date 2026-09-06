# Coss UI source

Components were copied from the official Coss registry at
`https://coss.com/ui/r/{component}.json` on 2026-09-05, following the
[manual installation guide](https://coss.com/ui/docs/get-started).

Components follow the registry defaults, with a flat finish: Button
decorative shadows and inset highlights are removed for a flatter appearance.
Button dimensions, typography, borders, variants, hover states, and focus rings
remain upstream defaults. Registry import paths are rewritten to local package
paths, and repository formatting is applied. Base UI
retains control behavior, focus management, portals, and keyboard support.

Button press motion matches the personal website: 150 ms with
`cubic-bezier(0.23, 1, 0.32, 1)`, scaling text buttons to 0.98 and icon buttons to
0.95 while active. Reduced motion disables scaling. Touch manipulation and tap
highlight suppression follow the same source.

Button loading states crossfade the label and spinner, with an optional
`loadingText` label. Both states share a grid cell to reserve width and avoid
layout shifts. Reduced motion disables the translate, blur, and scale effects.
A loading button is marked `aria-disabled` and ignores clicks, but is never
natively disabled, so it keeps focus and stays in the tab order; the `disabled`
prop alone sets the native attribute. Icon-only sizes require `aria-label` or
`aria-labelledby` at the type level, since they render no text.

`Spinner` is decorative by default (`aria-hidden`); pass `label` to make it a
`role="status"` under that name.

Select uses a 14 px leading checkmark with a 6 px text gap. Rows are 32 px on
desktop and 36 px on mobile; the leading inset matches the centered icon’s
vertical clearance (9 px / 11 px). Popups default to
`alignItemWithTrigger={false}` so they open below the trigger with a 4 px gap
instead of aligning the selected item over it; viewport collision handling remains enabled.

Switch keeps Coss's surface styling and press motion. Only its proportions follow
the personal website: track width/height is 13:6 and thumb width/height is 7:5.
Default is 52 × 24 px with a 2 px inset; `size="lg"` is 65 × 30 px with a
2.5 px inset on both desktop and mobile. Thumb size and travel derive from
those ratios. No gradient or white thumb override is applied.

UI icons, including Coss indicators and the loading spinner, use Remix Icons
from `@remixicon/react` instead of the registry's icon sources.

Automator's palette is mapped through the semantic CSS variables in
`packages/tailwind-config/colors.css`. Neutral border/input/secondary tokens use
Coss's opacity levels with our palette, except dark secondary uses 8% instead of
4% to separate buttons from the canvas. `--accent` sits above `--popover` so
highlighted rows stay visible on popup surfaces, and the earlier menu-only
accent override is gone. Light is `neutral-300`. Dark is a literal
`oklch(0.37 0.009 220)`, between `neutral-300` and `neutral-400`: the former
barely separates from the popup surface, the latter is light enough to pull
muted and destructive text below 4.5:1 on it.

Destructive follows Coss semantics: `--destructive-foreground` is the text on
the solid fill, and `--destructive-text` is for tints and plain backgrounds.
Dark `--destructive` is a literal `oklch(0.55 0.2 25)` rather than a palette
step, because no red step clears 3:1 against the dark canvas while its own
foreground clears 4.5:1. Both dark literals are deliberate exceptions to the
fixed five-step scales; each is commented where it is declared. Status badges use the `*-surface` backgrounds instead
of an opacity tint. Builder tokens (`--canvas`, `--node*`, `--edge*`,
`--overlay`, `--chart-1..5`) and the run-state mapping live in the same file;
`--shadow-color` is deliberately not in `@theme`, since Tailwind's `--shadow-*`
namespace generates box-shadow utilities.

Inter and Geist Mono match the Coss starter fonts, now with real fallback
stacks. Standard Tailwind text sizes remain available alongside app typography
roles. `styles.css` supplies the Coss radius scale with an added `--radius-xs`
(4 px, used by Checkbox and the small Badge), the `--z-popover` / `--z-overlay`
/ `--z-toast` stacking tokens, and base styles plus a reduced-motion
accessibility rule. `tw-animate-css` is removed; nothing used its utilities.

Files live in `src/`; `utils.ts` is the local class-name helper. `theme-provider.tsx`
and `theme-select.tsx` are local theme integration components. When refreshing
registry sources, preserve import rewrites, the theme integration, Button shadow removal, press motion, Select popup positioning, Switch proportions and motion, and Remix icons.

The registry sources correspond to `apps/ui/registry/default/` in
[cosscom/coss](https://github.com/cosscom/coss). The upstream
[licensing declaration](https://github.com/cosscom/coss/blob/main/LICENSING.md)
places `apps/ui/` under MIT; the repository root and its published internal
`packages/ui/` have a different license. `COSS-LICENSE.md` preserves the original
MIT notice from the upstream Origin/Coss UI source.
