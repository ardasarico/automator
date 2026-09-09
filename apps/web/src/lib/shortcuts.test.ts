import { expect, test } from "bun:test";
import { formatShortcut } from "./shortcuts";

test("apple platforms read combos as glyphs without separators", () => {
  expect(formatShortcut("mod+s", true)).toBe("⌘S");
  expect(formatShortcut("mod+enter", true)).toBe("⌘⏎");
  expect(formatShortcut("mod+shift+z", true)).toBe("⌘⇧Z");
  expect(formatShortcut("mod+k", true)).toBe("⌘K");
});

test("other platforms spell the modifiers out", () => {
  expect(formatShortcut("mod+s", false)).toBe("Ctrl+S");
  expect(formatShortcut("mod+enter", false)).toBe("Ctrl+Enter");
  expect(formatShortcut("mod+shift+z", false)).toBe("Ctrl+Shift+Z");
});

test("an unknown key keeps its own name", () => {
  expect(formatShortcut("mod+backspace", true)).toBe("⌘backspace");
});
