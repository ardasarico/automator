/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";

mock.module("server-only", () => ({}));
const { FlowStartOptions } = await import("./flow-start-options");

test("creates AI and blank flows only through submitted actions while examples remain a link", () => {
  const html = renderToString(<FlowStartOptions />);
  expect(html).toContain('href="#flow-examples-title"');
  expect(html).not.toContain('href="/create');
  expect(html.match(/<form /g)).toHaveLength(2);
  expect(html.match(/type="submit"/g)).toHaveLength(2);
  expect(html).toContain("Describe it to AI");
  expect(html).toContain("Start from an example");
  expect(html).toContain("Start blank");
});
