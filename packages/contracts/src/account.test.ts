import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { accountUsageContract, accountUsageSchema, totalRuns } from "./account";
import { flowRunSourceSchema } from "./flow-runs";
import { parseResponse } from "./contract";

const usage = {
  flows: 3,
  activeFlows: 1,
  runsLast30Days: { manual: 4, webhook: 2, schedule: 0, miniapp: 1, event: 0, watch: 0, api: 0 },
  secrets: 2,
  listings: 1,
  since: "2026-08-08T10:00:00.000Z",
};

describe("account usage contract", () => {
  test("accepts counts and rejects negatives or missing sources", () => {
    expect(Value.Check(accountUsageSchema, usage)).toBe(true);
    expect(Value.Check(accountUsageSchema, { ...usage, flows: -1 })).toBe(false);
    expect(Value.Check(accountUsageSchema, { ...usage, runsLast30Days: { manual: 1 } })).toBe(
      false,
    );
  });

  test("groups runs by every run source the history knows", () => {
    const sources = flowRunSourceSchema.anyOf.map((literal) => literal.const);
    expect(Object.keys(accountUsageSchema.properties.runsLast30Days.properties).sort()).toEqual(
      [...sources].sort(),
    );
  });

  test("parses a 200 through the endpoint contract and sums the runs", () => {
    const parsed = parseResponse(accountUsageContract, 200, usage);
    expect(parsed).toEqual({ status: 200, data: usage });
    expect(totalRuns(usage)).toBe(7);
    expect(accountUsageContract.path).toBe("/account/usage");
  });
});
