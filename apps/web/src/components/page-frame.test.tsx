import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { PageFrame } from "./page-frame";

test("the title renders as the page's only h1", () => {
  const html = renderToString(<PageFrame title="Flows">rows</PageFrame>);
  expect(html).toContain("<h1");
  expect(html.match(/<h1/g)?.length).toBe(1);
  expect(html).toContain("Flows");
});

test("a detail page names its parent as a link beside the title", () => {
  const html = renderToString(
    <PageFrame title="Payouts" parents={[{ label: "Data", href: "/data" }]}>
      records
    </PageFrame>,
  );
  expect(html).toContain('aria-label="Breadcrumb"');
  expect(html).toContain('href="/data"');
  expect(html).toContain("Data");
  expect(html.match(/<h1/g)?.length).toBe(1);
});

test("a page without parents renders no breadcrumb", () => {
  const html = renderToString(<PageFrame title="Wallet">balances</PageFrame>);
  expect(html).not.toContain('aria-label="Breadcrumb"');
});
