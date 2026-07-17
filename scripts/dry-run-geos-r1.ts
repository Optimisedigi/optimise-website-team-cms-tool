import { readFileSync } from "fs";
import path from "path";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Dry-run push for a single round's CMS import JSON.
 * Usage:
 *   npm run tsx -- scripts/dry-run-geos-r1.ts [round-suffix]
 *   npm run tsx -- scripts/dry-run-geos-r1.ts apply    # to actually push
 */

const APPLY = process.argv.includes("apply");
const ROUND = (process.argv.slice(2).find((a) => !a.startsWith("--") && a !== "apply") || "geos-r1");
const JSON_PATH = `/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/cms-import/shared-negative-review-${ROUND}-cms-import.json`;
const CLIENT_SLUG = "away-digital";

type Addition = { keyword: string; matchType: "exact" | "phrase"; flaggedForRemoval: false; sourceReviewIds: string[] };
type CmsImport = {
  round: string;
  client: { slug: string; id: number; name: string };
  approvedRows: number;
  totalAdditions: number;
  summary: Array<{ listName: string; additions: number; reviewedRows: number; keywords: Addition[] }>;
};

async function main() {
  const cmsImport: CmsImport = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  console.log(`Loaded ${cmsImport.summary.length} target lists from ${path.basename(JSON_PATH)} (round=${cmsImport.round}, mode=${APPLY ? "apply" : "dry-run"})`);

  const payload = await getPayload({ config: payloadConfig });
  const clients = await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true });
  const client = clients.docs[0] as any;
  if (!client) throw new Error(`Client not found: ${CLIENT_SLUG}`);

  const summary: any[] = [];
  for (const target of cmsImport.summary) {
    const found = await payload.find({
      collection: "negative-keyword-lists",
      where: { and: [{ client: { equals: client.id } }, { name: { equals: target.listName } }] },
      limit: 1,
      overrideAccess: true,
    });
    const list = found.docs[0] as any;
    if (!list) {
      console.log(`  [SKIP] List not found: ${target.listName}`);
      summary.push({ listName: target.listName, status: "missing" });
      continue;
    }
    const existing = Array.isArray(list.keywords) ? list.keywords : [];
    const existingKeys = new Set(existing.map((kw: any) => `${String(kw.keyword || "").trim().toLowerCase()}|${String(kw.matchType || "").toLowerCase()}`));
    const newOnes = target.keywords.filter((kw) => !existingKeys.has(`${kw.keyword.toLowerCase()}|${kw.matchType}`));
    const skipped = target.keywords.length - newOnes.length;
    console.log(`  ${target.listName}: existing=${existing.length}, reviewed=${target.reviewedRows}, would-add=${newOnes.length}, already-present=${skipped}`);
    summary.push({ listName: target.listName, listId: list.id, existingCount: existing.length, wouldAdd: newOnes.length, alreadyPresent: skipped });

    if (APPLY && newOnes.length > 0) {
      const additions = newOnes.map(({ sourceReviewIds, ...kw }) => kw);
      await payload.update({
        collection: "negative-keyword-lists",
        id: list.id,
        data: { keywords: [...existing, ...additions] },
        overrideAccess: true,
      });
      console.log(`    -> pushed ${additions.length} new negatives`);
    }
  }

  const total = summary.reduce((s, x) => s + (x.wouldAdd || 0), 0);
  console.log(`\n${APPLY ? "Applied" : "Would add"} ${total} new negatives across ${summary.length} lists.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
