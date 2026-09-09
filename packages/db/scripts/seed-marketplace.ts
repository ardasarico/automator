/**
 * Seeds the marketplace with demo community listings, so the community section is populated for
 * a demo rather than empty.
 *
 * These are NOT real accounts. Each author is a `did:seed:*` id that no Privy login can ever
 * reach, and the fork counts are numbers we chose — they are stage dressing, not usage. Node
 * configs are schema defaults, so a forked flow needs configuring exactly like the bundled
 * examples do.
 *
 * Run: `bun run --cwd packages/db seed:marketplace -- --yes`
 * It writes to whatever `DATABASE_URL` points at, so it refuses to move without `--yes`.
 */
import {
  flowNodeConfigSchemas,
  listingNodeTypes,
  parseNodeConfig,
  screenConfigSchemas,
  type FlowEdge,
  type FlowNode,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { SQL } from "bun";

type SeedNode = [id: string, type: FlowNodeType, column: number, row: number, label: string];
type SeedEdge = [source: string, sourceHandle: string, target: string, targetHandle: string];

type Seed = {
  slug: string;
  name: string;
  description: string;
  author: { username: string; name: string };
  forkCount: number;
  /** Days ago, so a re-seed keeps the list looking freshly published. */
  publishedDaysAgo: number;
  nodes: readonly SeedNode[];
  edges: readonly SeedEdge[];
};

const seeds: readonly Seed[] = [
  {
    slug: "proof-of-human-airdrop",
    name: "Proof-of-human airdrop",
    description: "Verify a visitor with World ID, then send them a one-off token drop.",
    author: { username: "kerem", name: "Kerem Aydın" },
    forkCount: 128,
    publishedDaysAgo: 5,
    nodes: [
      ["open", "trigger.miniapp-open", 0, 0, "Mini-app opened"],
      ["verify", "world.id-verify", 1, 0, "Prove you are human"],
      ["seen", "data.find-records", 2, 0, "Claimed already?"],
      ["send", "onchain.transfer-token", 3, 0, "Send the drop"],
      ["record", "data.create-record", 4, 0, "Record the claim"],
      ["done", "screen.page", 5, 0, "Drop sent"],
      ["already", "screen.page", 3, 1, "Already claimed"],
    ],
    edges: [
      ["open", "visitor", "verify", "visitor"],
      ["verify", "verified", "seen", "query"],
      ["seen", "empty", "send", "wallet"],
      ["send", "receipt", "record", "values"],
      ["record", "record", "done", "data"],
      ["seen", "found", "already", "data"],
    ],
  },
  {
    slug: "daily-eth-brief",
    name: "Daily ETH brief",
    description: "Read the treasury every morning, have a model write it up, and email it.",
    author: { username: "sena", name: "Sena Yıldız" },
    forkCount: 61,
    publishedDaysAgo: 8,
    nodes: [
      ["morning", "trigger.schedule", 0, 0, "Every morning"],
      ["read", "onchain.read-contract", 1, 0, "Read the treasury"],
      ["write", "ai.generate-text", 2, 0, "Write the brief"],
      ["mail", "notify.email", 3, 0, "Email the brief"],
    ],
    edges: [
      ["morning", "tick", "read", "args"],
      ["read", "result", "write", "prompt"],
      ["write", "text", "mail", "message"],
    ],
  },
  {
    slug: "invoice-to-payout",
    name: "Invoice to payout",
    description: "Pull the amount out of an invoice with AI and pay it if it is under the cap.",
    author: { username: "murathan", name: "Murathan Öz" },
    forkCount: 44,
    publishedDaysAgo: 3,
    nodes: [
      ["hook", "trigger.webhook", 0, 0, "Invoice received"],
      ["extract", "ai.extract", 1, 0, "Read the invoice"],
      ["cap", "logic.condition", 2, 0, "Under the cap?"],
      ["pay", "usdc.payout", 3, 0, "Pay the invoice"],
      ["confirm", "notify.discord", 4, 0, "Confirm on Discord"],
      ["review", "notify.telegram", 3, 1, "Send for review"],
    ],
    edges: [
      ["hook", "request", "extract", "text"],
      ["extract", "data", "cap", "value"],
      ["cap", "true", "pay", "recipient"],
      ["pay", "receipt", "confirm", "message"],
      ["cap", "false", "review", "message"],
    ],
  },
  {
    slug: "whale-watch",
    name: "Whale watch",
    description: "Ping Telegram the moment a watched wallet moves more than it should.",
    author: { username: "ecem", name: "Ecem Kaya" },
    forkCount: 34,
    publishedDaysAgo: 2,
    nodes: [
      ["watch", "trigger.balance", 0, 0, "Balance moved"],
      ["size", "logic.condition", 1, 0, "Big enough?"],
      ["ping", "notify.telegram", 2, 0, "Ping Telegram"],
    ],
    edges: [
      ["watch", "balance", "size", "value"],
      ["size", "true", "ping", "message"],
    ],
  },
  {
    slug: "community-roll-call",
    name: "Community roll call",
    description: "One human, one entry: verify at the door and keep the list in a table.",
    author: { username: "beyza", name: "Beyza Demir" },
    forkCount: 23,
    publishedDaysAgo: 6,
    nodes: [
      ["open", "trigger.miniapp-open", 0, 0, "Mini-app opened"],
      ["verify", "world.id-verify", 1, 0, "Verify at the door"],
      ["save", "data.create-record", 2, 0, "Add to the list"],
      ["done", "screen.confirmation", 3, 0, "You're on the list"],
    ],
    edges: [
      ["open", "visitor", "verify", "visitor"],
      ["verify", "verified", "save", "values"],
      ["save", "record", "done", "data"],
    ],
  },
  {
    slug: "gas-aware-rebalance",
    name: "Gas-aware rebalance",
    description: "Wait for a calm gas price, then rebalance the position in one write.",
    author: { username: "deniz", name: "Deniz Arı" },
    forkCount: 7,
    publishedDaysAgo: 1,
    nodes: [
      ["price", "trigger.price", 0, 0, "Gas price moved"],
      ["calm", "logic.condition", 1, 0, "Calm enough?"],
      ["write", "onchain.write-contract", 2, 0, "Rebalance"],
      ["wait", "logic.wait", 2, 1, "Wait it out"],
      ["tell", "notify.telegram", 3, 0, "Report the move"],
    ],
    edges: [
      ["price", "price", "calm", "value"],
      ["calm", "true", "write", "args"],
      ["calm", "false", "wait", "in"],
      ["write", "receipt", "tell", "message"],
    ],
  },
];

/* The grid the bundled examples are laid out on, so a seeded flow looks like a hand-made one. */
const columnGap = 300;
const rowGap = 150;
const origin = { x: 80, y: 120 };

const configSchemas: Record<string, TObject> = { ...flowNodeConfigSchemas, ...screenConfigSchemas };

function buildNode([id, type, column, row, label]: SeedNode): FlowNode {
  const schema = configSchemas[type];
  return {
    id,
    type,
    position: { x: origin.x + column * columnGap, y: origin.y + row * rowGap },
    label,
    /* Schema defaults: valid, and honest that a fork still needs setting up. */
    config: schema ? (parseNodeConfig(schema, {}) as Record<string, unknown>) : {},
  };
}

function buildEdge([source, sourceHandle, target, targetHandle]: SeedEdge): FlowEdge {
  return {
    id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

async function seedMarketplace(sql: SQL) {
  for (const seed of seeds) {
    const ownerId = `did:seed:${seed.author.username}`;
    const flowId = `seed-flow-${seed.slug}`;
    const nodes = seed.nodes.map(buildNode);
    const edges = seed.edges.map(buildEdge);
    const document = { version: 1 as const, nodes, edges };
    const nodeTypes = listingNodeTypes({ nodes });
    const publishedAt = new Date(Date.now() - seed.publishedDaysAgo * 86_400_000);

    await sql`
      INSERT INTO automator_users (id, name, username)
      VALUES (${ownerId}, ${seed.author.name}, ${seed.author.username})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, username = EXCLUDED.username`;

    await sql`
      INSERT INTO automator_flows (id, owner_id, name, description, document)
      VALUES (${flowId}, ${ownerId}, ${seed.name}, ${seed.description}, ${{ ...document, id: flowId, name: seed.name, description: seed.description }}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        document = EXCLUDED.document, updated_at = now()`;

    await sql`
      INSERT INTO automator_listings
        (id, slug, flow_id, owner_id, name, description, document, node_types, fork_count,
         published_at, updated_at)
      VALUES (${`seed-listing-${seed.slug}`}, ${seed.slug}, ${flowId}, ${ownerId}, ${seed.name},
        ${seed.description}, ${document}::jsonb, ${nodeTypes}::jsonb, ${seed.forkCount},
        ${publishedAt}, ${publishedAt})
      ON CONFLICT (flow_id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, document = EXCLUDED.document,
        node_types = EXCLUDED.node_types, fork_count = EXCLUDED.fork_count,
        published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at`;

    console.log(`seeded ${seed.slug} by @${seed.author.username}`);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(
    `Refusing to seed without --yes. This writes ${seeds.length} demo users, flows and listings to:\n  ${url.replace(/:\/\/[^@]*@/, "://***@")}`,
  );
  process.exit(1);
}

const sql = new SQL(url, { max: 2 });
try {
  await seedMarketplace(sql);
  console.log(`\nSeeded ${seeds.length} demo listings. Re-running is safe.`);
} finally {
  await sql.close();
}
