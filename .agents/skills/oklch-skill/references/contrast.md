# Contrast measurement

Identify the rendered foreground, background, opacity, and relevant state. Composite translucent layers before measuring; a parent token alone may not describe the background under a gradient or image.

For WCAG 2.2 text contrast, use the actual relative luminance ratio:

| Text   | AA minimum | AAA minimum |
| ------ | ---------- | ----------- |
| Normal | 4.5:1      | 7:1         |
| Large  | 3:1        | 4.5:1       |

Large text starts at 18 pt (24 CSS px), or 14 pt bold (about 18.67 CSS px). The old 18 px / 14 px cutoff is incorrect. See [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), including its exceptions.

Required visual information identifying controls and states generally needs 3:1 against adjacent colors under [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html); apply the criterion to the actual information, not every decorative border.

OKLCH lightness is not WCAG relative luminance. A lightness gap or a rule such as `L > 0.6` cannot determine a pass. Adjusting L is a useful first attempt, but chroma, hue, alpha, and gamut mapping can affect the result; remeasure the final pair.

Use APCA only as a separately labeled supplemental assessment when useful. It does not replace the WCAG 2.x contrast ratio, and its font-sensitive recommendations are not a single universal pass threshold.

Report the pair, state/theme, measured ratio, applicable threshold, and the smallest useful correction. Recheck affected semantic roles in both themes after changing shared tokens.
