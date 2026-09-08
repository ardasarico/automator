import { expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { navigationModule } from "../../../auth/test-navigation";

mock.module("next/navigation", () => navigationModule);

const { RunFilter } = await import("./run-filter");

test("an unknown flow stays visibly filtered instead of claiming all flows are shown", () => {
  const html = renderToString(<RunFilter flows={[]} selected="deleted-flow" />);
  expect(html).toMatch(/data-slot="select-value"[^>]*>Unavailable flow<\/span>/);
});

test("the unfiltered history labels its selected value as all flows", () => {
  const html = renderToString(<RunFilter flows={[]} selected="" />);
  expect(html).toMatch(/data-slot="select-value"[^>]*>All flows<\/span>/);
});
