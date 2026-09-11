import { container } from "../container";

/*
 * Option A — the section is proof. One run of a claim mini-app, shown in the product's own run
 * panel (`apps/web/src/builder/run-panel.tsx`): the node list on the left with the status dot,
 * label and elapsed time, the current node's outputs on the right. Every partner appears where
 * the run actually touches it: as a node label, a node id, an endpoint host, a token address,
 * a chain id, a model. The clock walks the rows the way a real run does.
 */

type Entry = { key: string; value: string };
type Step = {
  label: string;
  id: string;
  elapsed: string;
  entries: Entry[];
};

const steps: Step[] = [
  {
    label: "Mini-app opened",
    id: "trigger.miniapp-open",
    elapsed: "12 ms",
    entries: [{ key: "visitor", value: '{ "id": "v_8f2c1a", "locale": "en" }' }],
  },
  {
    label: "Privy login",
    id: "privy.login",
    elapsed: "640 ms",
    entries: [
      { key: "user", value: '{ "id": "did:privy:cm1x…9q", "wallet": "0x9aC3…41e2" }' },
      { key: "provider", value: "privy.io · embedded wallet" },
    ],
  },
  {
    label: "World ID verify",
    id: "world.id-verify",
    elapsed: "1.8 s",
    entries: [
      {
        key: "verified",
        value: '{ "nullifier_hash": "0x2f9c…e41b", "verification_level": "orb" }',
      },
      { key: "action", value: "claim · developer.worldcoin.org" },
    ],
  },
  {
    label: "Query subgraph",
    id: "graph.query-subgraph",
    elapsed: "410 ms",
    entries: [
      { key: "data", value: '{ "claims": [] }' },
      { key: "endpoint", value: "gateway.thegraph.com/api/subgraphs/id/…" },
    ],
  },
  {
    label: "AI agent",
    id: "ai.agent",
    elapsed: "2.1 s",
    entries: [
      { key: "result", value: '"No earlier claim on file. Send 25 USDC."' },
      { key: "model", value: "minimax/minimax-m3 · openrouter.ai" },
      { key: "tools", value: "query_subgraph" },
    ],
  },
  {
    label: "USDC payout",
    id: "usdc.payout",
    elapsed: "1.3 s",
    entries: [
      { key: "receipt", value: '{ "hash": "0x7c…f1", "amount": "25 USDC" }' },
      { key: "token", value: "USDC by Circle · 0x036C…CF7e" },
    ],
  },
  {
    label: "Write contract",
    id: "onchain.write-contract",
    elapsed: "1.9 s",
    entries: [
      { key: "receipt", value: '{ "blockNumber": 19402118, "status": "success" }' },
      { key: "chain", value: "Base Sepolia · 84532" },
    ],
  },
];

const total = "8.2 s";

function RunPanel() {
  return (
    <div
      className="mx-auto w-full max-w-[976px] overflow-hidden rounded-xl border border-foreground/12 bg-card text-[12px] leading-4"
      aria-label="One run of the claim flow, as the run panel shows it"
    >
      <div className="flex h-[37px] items-center gap-3 border-border border-b pr-2 pl-3">
        <span className="relative h-4 w-[72px]">
          <span className="bwa-head-run absolute inset-y-0 left-0 font-medium">Running</span>
          <span className="bwa-head-done absolute inset-y-0 left-0 font-medium text-[color:var(--chart-2)]">
            Succeeded
          </span>
        </span>
        <span className="bwa-head-done whitespace-nowrap text-muted-foreground">{total}</span>
        <span className="truncate text-muted-foreground">Started by Mini-app opened</span>
      </div>
      <div className="grid md:grid-cols-[minmax(200px,2fr)_minmax(0,3fr)]">
        <ol
          className="border-border border-b p-1 md:border-r md:border-b-0"
          aria-label="Nodes in this run"
        >
          {steps.map(({ label, elapsed }, i) => (
            <li
              key={label}
              className={`bwa-row${i} flex items-center gap-2 rounded-md px-2 py-[5px]`}
            >
              <span className={`bwa-dot${i} size-2 flex-none rounded-full`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="relative h-4 w-[104px] flex-none text-right text-muted-foreground tabular-nums">
                <span className={`bwa-run${i} absolute inset-y-0 right-0`}>running</span>
                <span className={`bwa-done${i} absolute inset-y-0 right-0 whitespace-nowrap`}>
                  succeeded · {elapsed}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid px-3 py-2.5">
          {steps.map(({ label, id, entries }, i) => (
            <div
              key={id}
              className={`bwa-detail${i} col-start-1 row-start-1`}
              aria-hidden={i !== steps.length - 1}
            >
              <p className="font-medium">{label}</p>
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">{id}</p>
              <dl className="flex flex-col gap-2">
                {entries.map(({ key, value }) => (
                  <div key={key}>
                    <dt className="mb-0.5 font-mono text-[11px] text-muted-foreground">{key}</dt>
                    <dd>
                      <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--canvas)] px-2 py-1.5 font-mono text-[11px] leading-[15px] [overflow-wrap:anywhere]">
                        {value}
                      </pre>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BuiltWithProof() {
  return (
    <section id="built-with" className={`${container} py-24 md:py-32`}>
      <div className="mx-auto mb-12 max-w-[52ch] text-center">
        <h2 className="text-balance font-semibold text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.12] tracking-[-0.02em]">
          Six partners, one run.
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          A claim flow read node by node: Privy signs in, World proves a person, The Graph answers,
          OpenRouter decides, Circle pays, Base settles.
        </p>
      </div>
      <RunPanel />
    </section>
  );
}
