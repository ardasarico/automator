import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScreenNode } from "./engine";
import { ScreenView } from "./screens";

function screen(type: ScreenNode["type"], config: Record<string, unknown>): ScreenNode {
  return { id: "s", type, label: "Screen", config, position: { x: 0, y: 0 } };
}

describe("screens", () => {
  test("a screen type this build does not know renders a note instead of nothing", () => {
    const node = { ...screen("screen.page", {}), type: "screen.hologram" } as unknown as ScreenNode;
    const html = renderToStaticMarkup(<ScreenView node={node} onContinue={() => {}} />);
    expect(html).toContain("This app needs a newer version of Automator.");
  });
});
