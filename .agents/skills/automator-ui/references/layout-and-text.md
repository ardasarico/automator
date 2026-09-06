# Layout and text

Automator is a compact application. Use the existing spacing and density before inventing a new scale. Group related controls through alignment and spacing; add a surface or divider when it communicates a distinct group or state.

For typography changes, read [the accepted type decision](../../../../docs/decisions/0003-use-inter-and-geist-mono.md) and `packages/tailwind-config/typography.css`. Preserve its Inter/Geist Mono roles and whole-pixel line heights at the default root size. Coss primitives also use their upstream Tailwind type classes; an app-level role is not a reason to restyle every primitive.

Check the constraints that affect the requested surface:

- Long names, URLs, wallet addresses, and multiline descriptions should wrap or truncate deliberately. Keep the complete value reachable when users need to inspect or copy it.
- Give shrinking flex/grid children `min-w-0` where needed. For bounded dialog or panel scrolling, trace the height constraint through `flex`, `min-h-0`, and the scroll viewport; keep actions reachable outside the scrolling content when the design requires a fixed footer.
- Judge breakpoints using content at narrow and wide widths. Fixed child containers exercise container queries; viewport queries need an actual viewport change.
- Use tabular figures for changing numeric values. Keep identifiers selectable and preserve their exact character order; isolate mixed-direction content when needed.
- Let semantic heading order and visual hierarchy work together. Preserve usable text when users zoom or increase font size.

Test wrapping with realistic content on the affected page. Reuse UI Lab for shared primitive cases; page layout needs its real surrounding chrome.
