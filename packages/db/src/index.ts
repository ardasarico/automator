import type { DatabaseStatus } from "@automator/contracts";
import { SQL } from "bun";
import { createAccountStore } from "./account";
import { createApiKeyStore } from "./api-keys";
import { createEventCursorStore } from "./event-cursors";
import { createFlowStore } from "./flows";
import { createListingStore } from "./listings";
import { migrate } from "./migrations";
import { createRunStore } from "./runs";
import { createSecretStore } from "./secrets";
import { createSessionStore } from "./sessions";
import { createUserStore } from "./users";
import { createFlowVersionStore } from "./flow-versions";
import { createTriggerClaimStore } from "./trigger-claims";
import { createWatchStateStore } from "./watch-state";
import { createPaymentPolicyStore } from "./payment-policies";
import { createDataTableStore } from "./data-tables";
import { createDataRecordStore } from "./data-records";
import { createNodePresetStore } from "./node-presets";
export {
  PaymentPolicyOwnerMissingError,
  PaymentPolicyDeniedError,
  type PaymentPolicyOperation,
  type PaymentPolicyStore,
} from "./payment-policies";
export {
  type TriggerClaimIssue,
  type TriggerClaimInput,
  type TriggerClaimResult,
  type TriggerClaimStore,
} from "./trigger-claims";
export { type AccountStore } from "./account";
export { apiKeyLimit, ApiKeyLimitError, type ApiKeyStore } from "./api-keys";
export {
  documentTriggerTypes,
  FlowOwnerMissingError,
  type FlowStore,
  type OwnedFlow,
} from "./flows";
export { type EventCursor, type EventCursorStore } from "./event-cursors";
export { type WatchState, type WatchStateStore } from "./watch-state";
export { type ListingStore } from "./listings";
export { migrate, migrations, type Migration } from "./migrations";
export { RunCursorError, type RunStore } from "./runs";
export {
  NodePresetLimitError,
  NodePresetOwnerMissingError,
  type NodePresetStore,
} from "./node-presets";
export { type SecretStore } from "./secrets";
export {
  type MiniAppSessionRow,
  type PaymentClaim,
  type SessionStore,
  type VisitorPaymentRow,
} from "./sessions";
export { UsernameTakenError, type UserStore } from "./users";
export { flowVersionLimit, type FlowVersionInput, type FlowVersionStore } from "./flow-versions";
export {
  dataTableLimit,
  DataColumnDuplicateError,
  DataColumnTypeLockedError,
  DataLimitError,
  DataTableOwnerMissingError,
  type DataTableStore,
} from "./data-tables";
export {
  assertRecordCapacity,
  assertRecordSize,
  dataRecordLimit,
  dataRecordMaxBytes,
  DataRecordCursorError,
  type DataRecordFilter,
  type DataRecordFindResult,
  type DataRecordQuery,
  type DataRecordSearch,
  type DataRecordSort,
  type DataRecordStore,
} from "./data-records";

export function createDatabase(url: string | undefined) {
  const sql = url ? new SQL(url, { max: 5, connectionTimeout: 3, idleTimeout: 20 }) : undefined;

  return {
    users: createUserStore(sql),
    flows: createFlowStore(sql),
    listings: createListingStore(sql),
    runs: createRunStore(sql),
    secrets: createSecretStore(sql),
    sessions: createSessionStore(sql),
    account: createAccountStore(sql),
    apiKeys: createApiKeyStore(sql),
    eventCursors: createEventCursorStore(sql),
    flowVersions: createFlowVersionStore(sql),
    watchState: createWatchStateStore(sql),
    triggerClaims: createTriggerClaimStore(sql),
    paymentPolicies: createPaymentPolicyStore(sql),
    dataTables: createDataTableStore(sql),
    dataRecords: createDataRecordStore(sql),
    nodePresets: createNodePresetStore(sql),
    async migrate() {
      if (sql) await migrate(sql);
    },
    async check(): Promise<DatabaseStatus> {
      if (!sql) return "not_configured";

      const query = sql`SELECT 1`.execute();
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          query,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              query.cancel();
              reject(new Error("Database health check timed out"));
            }, 3000);
          }),
        ]);
        return "up";
      } catch {
        return "down";
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      await sql?.close({ timeout: 5 });
    },
  };
}
