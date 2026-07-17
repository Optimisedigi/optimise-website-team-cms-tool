import { getPayload } from "payload";
import { readFileSync } from "fs";
import payloadConfig from "../src/payload.config";

/**
 * Cross-check GnG : High Cost/Difficult to Serve HTML rows against prod NKLs.
 * Reports which HTML rows are already blocked by prod (skip) vs which need review.
 *
 * Match rule (Google semantics, no BROAD):
 *   - prod EXACT "data"   -> blocks search "data" only
 *   - prod PHRASE "data"  -> blocks "data", "dataforce", "data engineer", "big data", etc.
 *
 * Usage: npm run tsx -- scripts/crosscheck-hc.ts
 */

const HTML_PATH = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/shared-negative-keyword-bulk-review.html";
const CLIENT_SLUG = "away-digital";
const TARGET_LISTS = ["[OD] Account wide negatives", "[OD] Geo country exclusion", "[OD] Competitor Negative list", "[OD] Brand Negative list"];

type ProdKw = { keyword: string; matchType: string };

function normalize(s: string) { return String(s || "").trim().toLowerCase(); }

// How a prod negative blocks a search term (the HTML row's keyword, treated as a search term)
function blocks(prod: ProdKw, htmlKw: string): boolean {
  const p = normalize(prod.keyword);
  const h = normalize(htmlKw);
  if (!p || !h) return false;
  const mt = normalize(prod.matchType);
  if (mt === "exact") return p === h;
  if (mt === "phrase") {
    // PHRASE: search contains the keyword as a token sequence
    return h.split(/\s+/).includes(p) || h.includes(p);
  }
  return false;
}

async function main() {
  const html = readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no data");
  const rows = JSON.parse(m[1]);
  const hcRows = rows.filter((r: any) => r.sharedSetId === "11532763617");

  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const allProd: ProdKw[] = [];
  const perList: Record<string, ProdKw[]> = {};
  for (const name of TARGET_LISTS) {
    const found = await payload.find({
      collection: "negative-keyword-lists",
      where: { and: [{ client: { equals: client.id } }, { name: { equals: name } }] },
      limit: 1,
      overrideAccess: true,
    });
    const list = found.docs[0] as any;
    if (!list) continue;
    const kws: ProdKw[] = Array.isArray(list.keywords) ? list.keywords : [];
    perList[name] = kws;
    allProd.push(...kws);
  }
  console.log(`Loaded ${allProd.length} prod negatives across ${Object.keys(perList).length} lists`);
  for (const [n, k] of Object.entries(perList)) console.log(`  ${n}: ${k.length}`);

  // Cross-check each HC row
  const covered: any[] = [];
  const needsReview: any[] = [];
  for (const r of hcRows) {
    const kw = r.currentKeyword;
    const hits = allProd.filter((p) => blocks(p, kw));
    if (hits.length) {
      covered.push({ id: r.id, currentKeyword: r.currentKeyword, finalKeyword: r.finalKeyword, currentMatchType: r.currentMatchType, finalMatchType: r.finalMatchType, finalCategory: r.finalCategory, blockedBy: hits.map((h) => `${h.keyword} [${h.matchType}]`) });
    } else {
      needsReview.push({ id: r.id, currentKeyword: r.currentKeyword, finalKeyword: r.finalKeyword, currentMatchType: r.currentMatchType, finalMatchType: r.finalMatchType, finalCategory: r.finalCategory });
    }
  }

  console.log("");
  console.log(`=== Cross-check summary ===`);
  console.log(`Total HC rows: ${hcRows.length}`);
  console.log(`Already covered by prod: ${covered.length}`);
  console.log(`Need your review: ${needsReview.length}`);

  console.log("");
  console.log(`=== Already covered (${covered.length}) — SKIP these ===`);
  for (const r of covered) {
    const bl = r.blockedBy[0];
    console.log(`  ${r.currentKeyword.padEnd(45)}  (finalCategory=${r.finalCategory})  blocked by: ${bl}`);
  }

  console.log("");
  console.log(`=== Needs your review (${needsReview.length}) ===`);
  for (const r of needsReview) {
    console.log(`  ${r.currentKeyword.padEnd(45)}  (finalCategory=${r.finalCategory})`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });