/**
 * Test fixtures for the LOCAL dev DB only.
 *
 * Creates clearly-named throwaway records ("ZZ Test ...") via the Payload
 * local API and records every created row to a teardown manifest so they can
 * be removed later.
 *
 * SAFETY: this script refuses to run unless DATABASE_URL points at a local
 * SQLite file (file:...). It must never touch production Turso.
 *
 * Run (create):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts
 *
 * Run (teardown — deletes everything in the manifest):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts --teardown
 *
 * Load .env first (PAYLOAD_SECRET etc.) then .env.local so its local-file
 * DATABASE_URL wins — same precedence Next.js uses for `npm run dev`.
 */
import fs from "fs";
import path from "path";
import { getPayload } from "payload";
import config from "../src/payload.config";

// ── Known test values (safe — local-only, not real secrets) ────────────────
const TEST_CLIENT_NAME = "ZZ Test Client";
const TEST_CLIENT_SLUG = "zz-test-client";
const TEST_CLIENT_PIN = "4729";
const TEST_GOOGLE_ADS_CUSTOMER_ID = "6591013898"; // 659-101-3898 (whitelisted read account)

const TEST_PROPOSAL_NAME = "ZZ Test Proposal";
const TEST_PROPOSAL_SLUG = "zz-test-proposal";
const TEST_PROPOSAL_PIN = "5836";
const TEST_PROPOSAL_WEBSITE = "https://zz-test-client.example.test";

const MANIFEST_DIR = path.join(process.cwd(), "docs", "test-runs");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "fixtures-manifest.jsonl");

type ManifestEntry = {
  collection: "clients" | "client-proposals";
  id: string | number;
  slug: string;
  createdAt: string;
};

function assertLocalDb(): void {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) {
    throw new Error(
      `Refusing to run: DATABASE_URL is not a local file DB (got "${url || "<empty>"}"). ` +
        `Run with: npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts`,
    );
  }
  if (process.env.DATABASE_AUTH_TOKEN) {
    throw new Error(
      "Refusing to run: DATABASE_AUTH_TOKEN is set (looks like a remote Turso target).",
    );
  }
}

function appendManifest(entry: ManifestEntry): void {
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.appendFileSync(MANIFEST_PATH, JSON.stringify(entry) + "\n", "utf8");
}

function readManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  return fs
    .readFileSync(MANIFEST_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ManifestEntry);
}

type AnyPayload = Awaited<ReturnType<typeof getPayload>>;

async function findOneBySlug(
  payload: AnyPayload,
  collection: ManifestEntry["collection"],
  slug: string,
): Promise<{ id: string | number; slug: string } | null> {
  const res = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });
  const doc = res.docs[0] as { id: string | number; slug: string } | undefined;
  return doc ?? null;
}

async function createFixtures(): Promise<void> {
  const payload = await getPayload({ config });

  // 1. Test client (reuse if it already exists) ────────────────────────────
  let client = await findOneBySlug(payload, "clients", TEST_CLIENT_SLUG);
  if (client) {
    console.log(`↺ Reusing existing client "${TEST_CLIENT_SLUG}" (id=${client.id})`);
  } else {
    const created = await payload.create({
      collection: "clients",
      data: {
        name: TEST_CLIENT_NAME,
        slug: TEST_CLIENT_SLUG,
        clientPin: TEST_CLIENT_PIN,
        googleAdsCustomerId: TEST_GOOGLE_ADS_CUSTOMER_ID,
        websiteUrl: "https://zz-test-client.example.test",
        isActive: true,
        // gsc / ga4 left disconnected (no tokens, no property ids).
      },
      overrideAccess: true,
    });
    client = { id: created.id, slug: (created as { slug: string }).slug };
    appendManifest({
      collection: "clients",
      id: client.id,
      slug: client.slug,
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ Created client "${TEST_CLIENT_SLUG}" (id=${client.id}, pin=${TEST_CLIENT_PIN})`);
  }

  // 2. Test proposal (reuse if it already exists) ───────────────────────────
  const existingProposal = await findOneBySlug(
    payload,
    "client-proposals",
    TEST_PROPOSAL_SLUG,
  );
  if (existingProposal) {
    console.log(
      `↺ Reusing existing proposal "${TEST_PROPOSAL_SLUG}" (id=${existingProposal.id})`,
    );
  } else {
    const created = await payload.create({
      collection: "client-proposals",
      data: {
        businessName: TEST_PROPOSAL_NAME,
        slug: TEST_PROPOSAL_SLUG,
        websiteUrl: TEST_PROPOSAL_WEBSITE,
        proposalPin: TEST_PROPOSAL_PIN,
        client: client.id as number,
      },
      overrideAccess: true,
    });
    appendManifest({
      collection: "client-proposals",
      id: created.id,
      slug: (created as { slug: string }).slug,
      createdAt: new Date().toISOString(),
    });
    console.log(
      `✅ Created proposal "${TEST_PROPOSAL_SLUG}" (id=${created.id}, pin=${TEST_PROPOSAL_PIN})`,
    );
  }

  console.log(`\nManifest: ${MANIFEST_PATH}`);
}

async function teardownFixtures(): Promise<void> {
  const payload = await getPayload({ config });
  const entries = readManifest();
  if (entries.length === 0) {
    console.log("Manifest is empty — nothing to tear down.");
    return;
  }

  // Delete proposals before clients (proposals reference clients).
  const ordered = [...entries].sort((a, b) =>
    a.collection === "client-proposals" ? -1 : b.collection === "client-proposals" ? 1 : 0,
  );

  let deleted = 0;
  for (const entry of ordered) {
    try {
      await payload.delete({
        collection: entry.collection,
        id: entry.id,
        overrideAccess: true,
      });
      console.log(`🗑  Deleted ${entry.collection} id=${entry.id} (${entry.slug})`);
      deleted++;
    } catch (err) {
      console.warn(
        `⚠️  Could not delete ${entry.collection} id=${entry.id}: ${(err as Error).message}`,
      );
    }
  }

  // Clear the manifest once teardown has run.
  fs.rmSync(MANIFEST_PATH, { force: true });
  console.log(`\nDeleted ${deleted}/${entries.length} records. Manifest cleared.`);
}

async function main(): Promise<void> {
  assertLocalDb();
  const teardown = process.argv.includes("--teardown");
  if (teardown) {
    await teardownFixtures();
  } else {
    await createFixtures();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
