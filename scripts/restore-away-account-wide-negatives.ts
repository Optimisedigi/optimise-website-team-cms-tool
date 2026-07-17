import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";
import { logActivity } from "../src/lib/activity-log";

const APPLY = process.argv.includes("--apply");
const CLIENT_ID = 6;
const LIST_ID = 13;
const SNAPSHOT_PATH = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/cms-import/shared-negative-review-cms-import-rollback-1782375197502.json";

type RestoredKeyword = {
  id?: string | null;
  keyword: string;
  matchType: "broad" | "phrase" | "exact";
  flaggedForRemoval: boolean;
  negatedAt?: string | null;
};

function keyOf(keyword: string, matchType: string): string {
  return `${keyword.trim().toLowerCase()}|${matchType.trim().toLowerCase()}`;
}

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const list = await payload.findByID({
    collection: "negative-keyword-lists",
    id: LIST_ID,
    depth: 0,
    overrideAccess: true,
  }) as any;
  if (Number(typeof list.client === "object" ? list.client?.id : list.client) !== CLIENT_ID) {
    throw new Error(`List ${LIST_ID} is not owned by client ${CLIENT_ID}`);
  }

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const snapshotList = snapshot.lists?.find((entry: any) => Number(entry.id) === LIST_ID);
  if (!snapshotList) throw new Error(`List ${LIST_ID} is missing from ${SNAPSHOT_PATH}`);

  const ledger = await payload.find({
    collection: "monthly-keyword-selection-rows",
    where: {
      and: [
        { client: { equals: CLIENT_ID } },
        { appliedToNKL: { equals: LIST_ID } },
        { appliedAt: { exists: true } },
      ],
    },
    limit: 5000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  } as any);

  const currentKeywords = Array.isArray(list.keywords) ? list.keywords : [];
  const restored = new Map<string, RestoredKeyword>();
  for (const entry of currentKeywords) {
    if (!entry?.keyword || !entry?.matchType) continue;
    restored.set(keyOf(entry.keyword, entry.matchType), {
      id: entry.id || null,
      keyword: entry.keyword,
      matchType: entry.matchType,
      flaggedForRemoval: Boolean(entry.flaggedForRemoval),
      negatedAt: entry.negatedAt || null,
    });
  }
  const currentKeys = new Set(restored.keys());

  for (const entry of snapshotList.keywords || []) {
    if (!entry?.keyword || !entry?.matchType) continue;
    const key = keyOf(entry.keyword, entry.matchType);
    if (!restored.has(key)) {
      restored.set(key, {
        keyword: entry.keyword,
        matchType: entry.matchType,
        flaggedForRemoval: false,
        negatedAt: entry.negatedAt || snapshot.createdAt || null,
      });
    }
  }

  const ledgerRows = (ledger.docs || []) as any[];
  for (const row of ledgerRows) {
    if (!row?.negativeKeyword || !row?.matchType) continue;
    const key = keyOf(row.negativeKeyword, row.matchType);
    if (!restored.has(key)) {
      restored.set(key, {
        keyword: row.negativeKeyword,
        matchType: row.matchType,
        flaggedForRemoval: false,
        negatedAt: row.appliedAt || null,
      });
    }
  }

  const restoredKeywords = Array.from(restored.values());
  const additions = restoredKeywords.filter((entry) => !currentKeys.has(keyOf(entry.keyword, entry.matchType)));
  const summary = {
    apply: APPLY,
    listId: LIST_ID,
    listName: list.name,
    currentCount: currentKeywords.length,
    snapshotCount: snapshotList.keywords?.length || 0,
    ledgerRows: ledgerRows.length,
    additions: additions.length,
    restoredCount: restoredKeywords.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return;

  mkdirSync("backups", { recursive: true });
  const backupPath = path.resolve("backups", `away-account-wide-before-restore-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), list }, null, 2));

  await payload.update({
    collection: "negative-keyword-lists",
    id: LIST_ID,
    depth: 0,
    data: { keywords: restoredKeywords },
    overrideAccess: true,
  });

  const verified = await payload.findByID({
    collection: "negative-keyword-lists",
    id: LIST_ID,
    depth: 0,
    overrideAccess: true,
  }) as any;
  const verifiedKeywords = Array.isArray(verified.keywords) ? verified.keywords : [];
  const verifiedKeys = new Set(verifiedKeywords.map((entry: any) => keyOf(entry.keyword, entry.matchType)));
  const missingAfterRestore = restoredKeywords.filter((entry) => !verifiedKeys.has(keyOf(entry.keyword, entry.matchType)));
  console.log(JSON.stringify({
    backupPath,
    verifiedCount: verifiedKeywords.length,
    missingAfterRestore: missingAfterRestore.length,
    concurrentAdditionsPreserved: Math.max(0, verifiedKeywords.length - restoredKeywords.length),
  }, null, 2));
  if (missingAfterRestore.length > 0) {
    throw new Error("Restore verification failed");
  }
  try {
    await logActivity(payload, {
      type: "negative_keyword_list_updated",
      title: `Restored ${additions.length} negative keywords`,
      description: `List: ${list.name}. Count: ${currentKeywords.length} → ${verifiedKeywords.length}. Sources: 25 Jun snapshot plus monthly-review ledger. Backup: ${backupPath}.`,
      client: CLIENT_ID,
    });
  } catch (error) {
    payload.logger?.warn?.(`Restore succeeded, but activity logging failed: ${error}`);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
