/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FlowStartOptions } from "./flow-start-options";

test("offers the AI, example and blank starts as links", () => {
  const html = renderToString(<FlowStartOptions />);
  expect(html).toContain('href="/create?ai=1"');
  expect(html).toContain('href="#flow-examples-title"');
  expect(html).toContain('href="/create"');
  expect(html).toContain("Describe it to AI");
  expect(html).toContain("Start from an example");
  expect(html).toContain("Start blank");
});
