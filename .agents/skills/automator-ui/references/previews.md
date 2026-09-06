# Visual alternatives and stress tests

Use `apps/ui-lab` for shared primitive previews, following its local instructions. Use the real page context for composition decisions. Import actual components and theme providers, and use local fixtures for previews that would otherwise contact a service.

## Compare alternatives

Choose the dimension that answers the user's question: layout, density, emphasis, typography, or motion. Produce enough distinct options to expose the tradeoff, with consistent realistic content and a simple selector or side-by-side view. Keep both light and dark modes available when comparing colors or themes.

Show each option at a useful size, exercise its interactions, and explain what it gains and costs. A recommendation is useful when grounded in the task. If the user already selected a direction or asked you to choose and implement, complete that work. Otherwise leave the working comparison available for their choice.

## Stress a component

Select scenarios supported by the component's actual contract: long/unbroken text, zero or many items, loading/error/disabled states, narrow containers, theme changes, and keyboard interactions where relevant. Avoid fabricating impossible props just to fill a matrix.

Observe the rendered scenarios and label concrete failures. Resize the viewport when testing viewport-dependent behavior. Launch or repair a local preview when needed to finish verification; a one-load budget is not a completion criterion.

For a requested fix, correct the cause and repeat the failing scenario. For a review-only request, report the evidence and suggested change. Keep a requested comparison available; after integrating a chosen variant, remove obsolete alternatives unless they provide a useful permanent UI Lab example.
