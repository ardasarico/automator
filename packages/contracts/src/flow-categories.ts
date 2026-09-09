import type { FlowNodeType } from "./flows";

/**
 * What kind of thing a node is. The builder's catalog carries the same categories alongside its
 * icons and copy; this map is the part the API needs too, so a check that has to agree with the
 * canvas — which nodes can start a flow — does not depend on anything in the web app.
 *
 * The node type's prefix is not enough to derive this: `world.verification-completed` is a
 * trigger while `world.id-verify` is an integration, and `usdc.*` are integrations rather than
 * onchain nodes.
 */
export const flowNodeCategories = [
  "trigger",
  "logic",
  "data",
  "onchain",
  "ai",
  "screen",
  "notify",
  "integration",
] as const;
export type FlowNodeCategory = (typeof flowNodeCategories)[number];

export const flowNodeCategory: Record<FlowNodeType, FlowNodeCategory> = {
  "trigger.schedule": "trigger",
  "trigger.onchain-event": "trigger",
  "trigger.price": "trigger",
  "trigger.balance": "trigger",
  "trigger.webhook": "trigger",
  "trigger.miniapp-open": "trigger",
  "trigger.manual": "trigger",
  "world.verification-completed": "trigger",
  "logic.condition": "logic",
  "logic.switch": "logic",
  "logic.wait": "logic",
  "logic.for-each": "logic",
  "logic.merge": "logic",
  "logic.filter": "logic",
  "logic.set-variable": "logic",
  "logic.run-code": "logic",
  "onchain.read-contract": "onchain",
  "onchain.write-contract": "onchain",
  "onchain.transfer-token": "onchain",
  "onchain.sign-message": "onchain",
  "ai.agent": "ai",
  "ai.classify": "ai",
  "ai.extract": "ai",
  "ai.generate-text": "ai",
  "screen.page": "screen",
  "screen.form": "screen",
  "screen.confirmation": "screen",
  "screen.qr-code": "screen",
  "notify.telegram": "notify",
  "notify.email": "notify",
  "notify.discord": "notify",
  "world.id-verify": "integration",
  "privy.wallet": "integration",
  "privy.login": "integration",
  "privy.sign-transaction": "integration",
  "usdc.payment": "integration",
  "usdc.payout": "integration",
  "usdc.balance": "integration",
  "data.create-record": "data",
  "data.find-records": "data",
  "data.update-record": "data",
  "data.delete-record": "data",
};

/** Whether a node of this type can start a flow. */
export function isTriggerNodeType(type: FlowNodeType): boolean {
  return flowNodeCategory[type] === "trigger";
}
