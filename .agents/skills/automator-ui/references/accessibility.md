# Accessibility

Preserve native controls and the keyboard, portal, and focus behavior already supplied by Base UI. Inspect the rendered element when composing a Coss control with a link or trigger; avoid nested interactive elements or a role that disagrees with the action.

For the affected flow, verify:

- Each control has an accessible name. Labels remain visible after input; icon-only actions have names; decorative icons stay out of the accessibility tree.
- Keyboard users can reach and operate the controls, see focus, dismiss overlays, and return to a sensible focus target. Use the component's supported focus APIs before adding manual traps or key handlers.
- Field errors are associated with their inputs. Pending and result states are perceivable; `aria-disabled` requires actual activation suppression, while native `disabled` changes focus and form behavior.
- Non-urgent asynchronous updates use a stable status region where announcements are needed. Critical information and recovery actions remain available after transient notifications disappear.
- Reduced motion removes distracting movement while preserving a static state cue. Zoom and text resizing keep controls and content reachable.

Use the [W3C target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) for size or spacing failures. Its AA minimum is 24 by 24 CSS pixels with defined exceptions. Larger touch targets can help, but do not enlarge every Coss control to a generic 44 px template. Expanded hit areas must not collide with neighboring controls.

For reflow, distinguish ordinary page content from genuinely two-dimensional regions such as a workflow canvas. A canvas's geometry does not exempt its toolbar, inspector, or forms from usable reflow and keyboard access. Consult [the reflow criterion](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) when assessing the exception.

For color failures, measure the actual foreground/background pair using [the contrast reference](../../oklch-skill/references/contrast.md). A token name or OKLCH lightness gap alone is not evidence of sufficient contrast.

A DOM accessibility snapshot and automated audit help find defects; neither establishes screen-reader behavior. State which interactions and assistive technologies were actually tested.
