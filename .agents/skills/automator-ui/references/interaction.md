# Interaction polish

Use Coss surfaces and the existing motion language. A new animation, radius formula, shadow, or hover treatment needs a visible purpose in the requested change.

- Align asymmetric icons optically when needed. Use the project's Remix line icons and `currentColor`; avoid applying stroke-width recipes from stroke-based icon libraries to filled SVG paths.
- Keep frequent interactions immediate and state changes interruptible. Choose duration and easing from nearby components before adding new values.
- Animate only the properties that change. Add compositor hints after observing a rendering problem rather than across all controls.
- Preserve static feedback for loading, selection, success, and errors. Motion is an enhancement to that feedback.
- Preserve the shared theme provider's transition behavior; inspect it before adding a second mechanism to suppress theme-switch animations.
- Check nested radius, clipping, focus outlines, and shadows together. Visual containment should not clip menus, tooltips, or keyboard focus.

For a motion fix, exercise enter, exit, rapid reversal, and reduced motion. For a surface-only adjustment, inspect the affected themes and states. Avoid applying a universal press scale or icon crossfade to unrelated components.
