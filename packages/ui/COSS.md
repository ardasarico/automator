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
4% to separate buttons from the canvas. No component-specific color overrides are
needed. Inter and Geist Mono match the Coss starter fonts. Standard Tailwind text
sizes remain available alongside app typography roles. `styles.css` supplies the
Coss radius scale and base styles, plus a reduced-motion accessibility rule.

Files live in `src/`; `utils.ts` is the local class-name helper. `theme-provider.tsx`
and `theme-select.tsx` are local theme integration components. When refreshing
registry sources, preserve import rewrites, the theme integration, Button shadow removal, press motion, Select popup positioning, Switch proportions and motion, and Remix icons.

The registry sources correspond to `apps/ui/registry/default/` in
[cosscom/coss](https://github.com/cosscom/coss). The upstream
[licensing declaration](https://github.com/cosscom/coss/blob/main/LICENSING.md)
places `apps/ui/` under MIT; the repository root and its published internal
`packages/ui/` have a different license. `COSS-LICENSE.md` preserves the original
MIT notice from the upstream Origin/Coss UI source.
