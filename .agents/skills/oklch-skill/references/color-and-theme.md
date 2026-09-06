# Color and theme work

Use an actual color conversion implementation or browser-supported color tooling. Preserve alpha and enough precision to avoid visible drift. Check the resulting display gamut; valid OKLCH syntax does not guarantee an in-gamut sRGB color.

A format conversion should preserve appearance and gradient interpolation. Keep CSS keywords and third-party values whose API expects another format. A conversion request does not imply a palette redesign.

For a new scale, match the token roles and labels in the existing theme. Vary lightness and chroma deliberately, check hue behavior, and inspect the samples together. Equal OKLCH lightness or a fixed percentage of maximum chroma is a starting point, not proof of equally readable or equally vivid colors.

For out-of-gamut colors, choose and document a mapping approach, then inspect the mapped result. Reducing chroma while holding lightness and hue is one option; verify that the mapped color still meets the intended contrast.

Automator keeps chromatic scales stable between themes and changes semantic mappings and neutrals according to the accepted theme decision. Avoid automatically reversing every brand palette. Use existing Tailwind token declarations and check the compiled CSS when changing aliases or theme scope.

Consult Context7 or [CSS Color documentation](https://www.w3.org/TR/css-color-4/) for unfamiliar conversion or gamut behavior, and [Tailwind theme documentation](https://tailwindcss.com/docs/theme) for version-specific integration.
