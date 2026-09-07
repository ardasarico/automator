import { Value } from "@sinclair/typebox/value";
import { expect, test } from "bun:test";
import { buildPath } from "./contract";
import { getPublicFlowContract } from "./public";

test("the public flow read is a GET on /public/flows/:id answering a summary, never the document", () => {
  expect(buildPath(getPublicFlowContract, { id: "a b" })).toBe("/public/flows/a%20b");
  expect(
    Value.Check(getPublicFlowContract.response[200], {
      id: "f",
      name: "F",
      description: "",
      updatedAt: "2026-09-07T00:00:00.000Z",
    }),
  ).toBe(true);
  expect(
    Value.Check(getPublicFlowContract.response[200], {
      flow: { version: 1, id: "f", name: "F", description: "", nodes: [], edges: [] },
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    }),
  ).toBe(false);
});
