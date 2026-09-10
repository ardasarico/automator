import { describe, expect, test } from "bun:test";
import { integrationSkipNotice } from "./integration-notice";

describe("integrationSkipNotice", () => {
  test("says how many suites were skipped and the exact command that runs them", () => {
    expect(integrationSkipNotice(11)).toBe(
      "packages/db: skipped 11 integration test files because TEST_DATABASE_URL is not set. " +
        "They are the only tests that reach Postgres, so schema drift passes without them. " +
        'Run them with: TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db',
    );
  });

  test("counts one file in the singular, because a wrong plural reads like a bug", () => {
    expect(integrationSkipNotice(1)).toContain("skipped 1 integration test file because");
  });
});
