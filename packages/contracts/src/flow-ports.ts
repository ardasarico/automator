import type { FlowNodeType } from "./flows";

export interface FlowNodePorts {
  inputs: readonly string[];
  outputs: readonly string[];
}

const ports = (inputs: readonly string[], outputs: readonly string[]): FlowNodePorts => ({
  inputs,
  outputs,
});

export const flowNodePorts: Record<FlowNodeType, FlowNodePorts> = {
  "trigger.schedule": ports([], ["tick"]),
  "trigger.onchain-event": ports([], ["event"]),
  "trigger.price": ports([], ["price"]),
  "trigger.balance": ports([], ["balance"]),
  "trigger.webhook": ports([], ["request"]),
  "trigger.miniapp-open": ports([], ["visitor"]),
  "trigger.manual": ports([], ["run"]),
  "logic.condition": ports(["value"], ["true", "false"]),
  "logic.switch": ports(["value"], ["match", "default"]),
  "logic.wait": ports(["in"], ["done"]),
  "logic.for-each": ports(["items"], ["item", "done"]),
  "logic.merge": ports(["a", "b"], ["merged"]),
  "logic.filter": ports(["items"], ["kept", "dropped"]),
  "logic.set-variable": ports(["value"], ["value"]),
  "logic.run-code": ports(["input"], ["output"]),
  "onchain.read-contract": ports(["args"], ["result"]),
  "onchain.write-contract": ports(["wallet", "args"], ["receipt"]),
  "onchain.transfer-token": ports(["wallet", "amount"], ["receipt"]),
  "onchain.sign-message": ports(["wallet", "message"], ["signature"]),
  "ai.agent": ports(["prompt", "context"], ["result"]),
  "ai.classify": ports(["text"], ["label"]),
  "ai.extract": ports(["text"], ["data"]),
  "ai.generate-text": ports(["prompt"], ["text"]),
  "screen.page": ports(["data"], ["next"]),
  "screen.form": ports(["data"], ["submitted"]),
  "screen.confirmation": ports(["data"], ["confirmed", "cancelled"]),
  "screen.qr-code": ports(["value"], ["next"]),
  "notify.telegram": ports(["message"], ["sent"]),
  "notify.email": ports(["message"], ["sent"]),
  "notify.discord": ports(["message"], ["sent"]),
  "world.id-verify": ports(["visitor"], ["verified", "rejected"]),
  "world.selfie-check": ports(["visitor"], ["verified", "rejected"]),
  "world.verification-completed": ports([], ["proof"]),
  "privy.wallet": ports(["visitor"], ["wallet"]),
  "privy.login": ports(["visitor"], ["user"]),
  "privy.sign-transaction": ports(["wallet", "transaction"], ["signed"]),
  "usdc.payment": ports(["amount"], ["paid", "declined"]),
  "usdc.payout": ports(["recipient", "amount"], ["receipt"]),
  "usdc.balance": ports(["wallet"], ["balance"]),
  "graph.query-subgraph": ports(["params"], ["data"]),
  "data.create-record": ports(["values"], ["record"]),
  "data.find-records": ports(["query"], ["found", "empty"]),
  "data.update-record": ports(["record"], ["record"]),
  "data.delete-record": ports(["record"], ["record"]),
};
