/*
 * Integration tests are the only ones here that reach Postgres, and they skip themselves when
 * `TEST_DATABASE_URL` is unset. A silent skip once let a CHECK constraint ship that no memory
 * fixture could contradict, so the run says what it left out and how to run it.
 */
export function integrationSkipNotice(files: number): string {
  const suites = `${files} integration test file${files === 1 ? "" : "s"}`;
  return (
    `packages/db: skipped ${suites} because TEST_DATABASE_URL is not set. ` +
    "They are the only tests that reach Postgres, so schema drift passes without them. " +
    'Run them with: TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db'
  );
}

/** How many suites the notice is speaking for, counted rather than kept in step by hand. */
export function countIntegrationSuites(directory: string): number {
  return [...new Bun.Glob("*.integration.test.ts").scanSync(directory)].length;
}
