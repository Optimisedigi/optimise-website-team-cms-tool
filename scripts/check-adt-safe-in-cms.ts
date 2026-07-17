import { readFileSync } from "fs";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Check which SAFE_KEEP rows from the ADT negative keyword list - Account
 * are present in the production Account wide NKL.
 *
 * Usage: npm run tsx -- scripts/check-adt-safe-in-cms.ts
 */

const ADT_SET_ID = "11308048256";
const ACCOUNT_WIDE = "[OD] Account wide negatives";
const HTML_PATH = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/shared-negative-keyword-bulk-review.html";

type Row = { id: string; sharedSetId: string; finalCategory: string; finalKeyword?: string; finalMatchType?: string; currentKeyword: string };
type CmsKeyword = { keyword: string; matchType: string };

function normalizeKeyword(k: string) { return String(k || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\s+/g, " "); }

async function main() {
  const html = readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Could not find data script in HTML");
  const rows: Row[] = JSON.parse(m[1]);

  const adtSafe = rows.filter((r) => r.sharedSetId === ADT_SET_ID && r.finalCategory === "SAFE_KEEP");
  console.log(`ADT SAFE_KEEP rows in HTML: ${adtSafe.length}`);

  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: "away-digital" } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const found = await payload.find({
    collection: "negative-keyword-lists",
    where: { and: [{ client: { equals: client.id } }, { name: { equals: ACCOUNT_WIDE } }] },
    limit: 1,
    overrideAccess: true,
  });
  const list = found.docs[0] as any;
  if (!list) throw new Error(`${ACCOUNT_WIDE} not found`);
  const existing: CmsKeyword[] = Array.isArray(list.keywords) ? list.keywords : [];
  console.log(`Current ${ACCOUNT_WIDE} count: ${existing.length}`);

  const existingKeys = new Set(existing.map((kw) => `${normalizeKeyword(String(kw.keyword)).toLowerCase()}|${String(kw.matchType).toLowerCase()}`));
  const present: Row[] = [];
  const missing: Row[] = [];
  for (const r of adtSafe) {
    const kw = normalizeKeyword(r.finalKeyword || r.currentKeyword);
    const mt = String(r.finalMatchType || "").toLowerCase();
    if (existingKeys.has(`${kw.toLowerCase()}|${mt}`)) present.push(r);
    else missing.push(r);
  }

  console.log(`\nIn HTML marked SAFE_KEEP and in CMS: ${present.length}`);
  console.log(`In HTML marked SAFE_KEEP but NOT in CMS: ${missing.length}`);
  if (missing.length) {
    console.log(`\n--- NOT in CMS (would-add) ---`);
    for (const r of missing.slice(0, 20)) {
      console.log(`  ${(r.finalKeyword || r.currentKeyword).padEnd(40)} [${r.finalMatchType}]  ${r.id}`);
    }
    if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);
  }
  if (present.length) {
    console.log(`\n--- Already in CMS (sample of 10) ---`);
    for (const r of present.slice(0, 10)) {
      console.log(`  ${(r.finalKeyword || r.currentKeyword).padEnd(40)} [${r.finalMatchType}]`);
    }
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
