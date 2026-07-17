import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

const REVIEW_HTML = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/shared-negative-keyword-bulk-review.html";
const OUT = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/cms-import";
const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK_ARG = process.argv.find((arg) => arg.startsWith("--rollback="));
const CLIENT_SLUG = "away-digital";

const TARGET_LISTS = {
  ACCOUNT_WIDE: "[OD] Account wide negatives",
  GEO: "[OD] Geo country exclusion",
  COMPETITOR: "[OD] Competitor Negative list",
} as const;

type ReviewRow = {
  id: string;
  listName: string;
  currentKeyword: string;
  finalCategory: string;
  finalKeyword?: string;
  finalMatchType?: string;
  targetListHint?: string;
};

function extractRows(html: string): ReviewRow[] {
  const match = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Could not find review data JSON in HTML");
  return JSON.parse(match[1]);
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/^['"]+|['"]+$/g, "").replace(/\s+/g, " ");
}

function normalizeMatchType(matchType: string | undefined): "exact" | "phrase" | null {
  const value = String(matchType || "").trim().toUpperCase();
  if (value === "EXACT") return "exact";
  if (value === "PHRASE") return "phrase";
  return null;
}

function targetListFor(row: ReviewRow): string {
  const hint = row.targetListHint || "";
  if (/competitor/i.test(hint)) return TARGET_LISTS.COMPETITOR;
  if (/geo/i.test(hint)) return TARGET_LISTS.GEO;
  return TARGET_LISTS.ACCOUNT_WIDE;
}

async function restoreSnapshot(payload: any, snapshotPath: string) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  for (const list of snapshot.lists || []) {
    await payload.update({
      collection: "negative-keyword-lists",
      id: list.id,
      data: { keywords: list.keywords || [] },
      overrideAccess: true,
    });
  }
  console.log(JSON.stringify({ restored: true, snapshotPath, lists: (snapshot.lists || []).map((list: any) => ({ id: list.id, name: list.name, keywords: list.keywords?.length || 0 })) }, null, 2));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = extractRows(readFileSync(REVIEW_HTML, "utf8"));
  const approvedRows = rows
    .filter((row) => row.finalCategory === "SAFE_KEEP")
    .flatMap((row) => {
      const keyword = normalizeKeyword(row.finalKeyword || row.currentKeyword || "");
      const matchType = normalizeMatchType(row.finalMatchType);
      return keyword && matchType ? [{ ...row, keyword, matchType, listName: targetListFor(row) }] : [];
    });

  const byList = new Map<string, typeof approvedRows>();
  for (const row of approvedRows) {
    const listRows = byList.get(row.listName) || [];
    listRows.push(row);
    byList.set(row.listName, listRows);
  }

  const payload = await getPayload({ config: payloadConfig });
  if (ROLLBACK_ARG) {
    await restoreSnapshot(payload, ROLLBACK_ARG.slice("--rollback=".length));
    process.exit(0);
  }

  const clients = await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true });
  const client = clients.docs[0] as any;
  if (!client) throw new Error(`Client not found: ${CLIENT_SLUG}`);

  const summary: any[] = [];
  const snapshot: any = { createdAt: new Date().toISOString(), client: { id: client.id, name: client.name, slug: client.slug }, lists: [] };
  for (const [listName, listRows] of byList) {
    const found = await payload.find({
      collection: "negative-keyword-lists",
      where: { and: [{ client: { equals: client.id } }, { name: { equals: listName } }] },
      limit: 1,
      overrideAccess: true,
    });
    const list = found.docs[0] as any;
    if (!list) throw new Error(`Negative keyword list not found for ${client.name}: ${listName}`);

    const existing = Array.isArray(list.keywords) ? list.keywords : [];
    snapshot.lists.push({ id: list.id, name: listName, keywords: existing });
    const existingKeys = new Set(existing.map((kw: any) => `${normalizeKeyword(String(kw.keyword || "")).toLowerCase()}|${String(kw.matchType || "").toLowerCase()}`));
    const additionsByKey = new Map<string, { keyword: string; matchType: "exact" | "phrase"; flaggedForRemoval: false; sourceReviewIds: string[] }>();

    for (const row of listRows) {
      const key = `${row.keyword.toLowerCase()}|${row.matchType}`;
      if (existingKeys.has(key)) continue;
      const existingAddition = additionsByKey.get(key);
      if (existingAddition) {
        existingAddition.sourceReviewIds.push(row.id);
      } else {
        additionsByKey.set(key, { keyword: row.keyword, matchType: row.matchType, flaggedForRemoval: false, sourceReviewIds: [row.id] });
      }
    }

    const additions = Array.from(additionsByKey.values());
    summary.push({ listName, listId: list.id, existingCount: existing.length, reviewedRows: listRows.length, additions: additions.length, keywords: additions });

    if (!DRY_RUN && additions.length > 0) {
      await payload.update({
        collection: "negative-keyword-lists",
        id: list.id,
        data: { keywords: [...existing, ...additions.map(({ sourceReviewIds, ...kw }) => kw)] },
        overrideAccess: true,
      });
    }
  }

  const output = {
    dryRun: DRY_RUN,
    client: { id: client.id, name: client.name, slug: client.slug },
    approvedRows: approvedRows.length,
    totalAdditions: summary.reduce((sum, s) => sum + s.additions, 0),
    snapshotPath: DRY_RUN ? null : path.join(OUT, `shared-negative-review-cms-import-rollback-${Date.now()}.json`),
    summary,
  };
  if (!DRY_RUN && output.totalAdditions > 0) {
    writeFileSync(output.snapshotPath!, JSON.stringify(snapshot, null, 2));
  }
  writeFileSync(path.join(OUT, `shared-negative-review-cms-import-${DRY_RUN ? "dry-run" : "apply"}.json`), JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ dryRun: DRY_RUN, approvedRows: output.approvedRows, totalAdditions: output.totalAdditions, summary: summary.map(({ keywords, ...s }) => s) }, null, 2));
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
