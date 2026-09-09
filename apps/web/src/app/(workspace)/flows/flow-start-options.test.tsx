/// <reference types="bun" />
import { expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";

mock.module("server-only", () => ({}));
const { FlowStartOptions } = await import("./flow-start-options");

test("only the blank card creates a flow, and never through a link", () => {
  const html = renderToString(<FlowStartOptions />);
  expect(html).toContain('href="#flow-examples-title"');
  expect(html).not.toContain('href="/create');
  /* One submitted action, for the one card that has something to save. */
  expect(html.match(/<form /g)).toHaveLength(1);
  expect(html.match(/type="submit"/g)).toHaveLength(1);
  expect(html).toContain("Describe it to AI");
  expect(html).toContain("Start from an example");
  expect(html).toContain("Start blank");
});

/* The old card saved an "Untitled flow" before the user had said anything; a draft that was
 * never asked for, or that failed, left it behind on the Flows list. */
test("describing a flow to AI sends the visitor to the prompt without creating anything", () => {
  const html = renderToString(<FlowStartOptions />);
  expect(html).toContain('href="/?draft=1"');
  const aiCard = html.slice(
    html.indexOf("Describe it to AI") - 400,
    html.indexOf("Describe it to AI"),
  );
  expect(aiCard).not.toContain("<form ");
});
