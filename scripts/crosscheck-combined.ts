import { readFileSync, writeFileSync } from "fs";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Cross-check the combined-deduped CSV against prod negative-keyword-lists.
 * For each keyword in the CSV, check if it's already blocked (as a search term)
 * by any prod EXACT or PHRASE negative.
 *
 * Output: a new CSV with action=keep or action=already_in_prod, and a summary.
 */

const CSV_PATH = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/combined-deduped.csv";
const OUT_CSV = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/combined-vs-prod.csv";
const CLIENT_SLUG = "away-digital";
const TARGET_LISTS = ["[OD] Account wide negatives", "[OD] Geo country exclusion", "[OD] Competitor Negative list", "[OD] Brand Negative list", "[OD] Excluding Vietnam Negatives"];

function tokenize(k: string): string[] { return k.toLowerCase().trim().split(/\s+/).filter(Boolean); }
function norm(s: string): string { return s.toLowerCase().trim(); }

// Does prod (prodKw, prodMt) block the search term (kw, mt)?
// The CSV keyword is treated as a search term. Prod negative must be EXACT or PHRASE.
function blocksSearch(prodKw: string, prodMt: string, searchKw: string): boolean {
  const p = norm(prodKw);
  const s = norm(searchKw);
  if (!p || !s) return false;
  const mt = prodMt.toUpperCase();
  if (mt === "EXACT") return p === s;
  if (mt === "PHRASE") {
    const pTok = tokenize(p);
    const sTok = tokenize(s);
    let i = 0;
    for (const t of sTok) {
      if (t === pTok[i]) i++;
      if (i === pTok.length) return true;
    }
    return false;
  }
  return false;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const text = readFileSync(CSV_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const headerIdx = lines[0].toLowerCase().startsWith("keyword") ? 0 : 1; // first line should be header
  const rows: { keyword: string; matchType: string; sourceList: string }[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCsvLine(line);
    if (parts.length < 2) continue;
    rows.push({ keyword: parts[0], matchType: parts[1].toUpperCase(), sourceList: parts[2] || "" });
  }
  console.log(`Loaded ${rows.length} rows from CSV`);

  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const allProd: { keyword: string; matchType: string; listName: string }[] = [];
  for (const name of TARGET_LISTS) {
    const found = await payload.find({
      collection: "negative-keyword-lists",
      where: { and: [{ client: { equals: client.id } }, { name: { equals: name } }] },
      limit: 1,
      overrideAccess: true,
    });
    const list = found.docs[0] as any;
    if (!list) continue;
    const kws = Array.isArray(list.keywords) ? list.keywords : [];
    for (const k of kws) {
      allProd.push({ keyword: String(k.keyword || ""), matchType: String(k.matchType || ""), listName: name });
    }
  }
  console.log(`Loaded ${allProd.length} prod negatives across ${TARGET_LISTS.length} lists`);
  const prodExact = allProd.filter((p) => p.matchType.toUpperCase() === "EXACT");
  const prodPhrase = allProd.filter((p) => p.matchType.toUpperCase() === "PHRASE");
  console.log(`  EXACT: ${prodExact.length}, PHRASE: ${prodPhrase.length}`);

  // Cross-check each row (keyword treated as search term)
  const covered: { row: typeof rows[number]; blockedBy: string }[] = [];
  const notCovered: typeof rows[number][] = [];
  for (const r of rows) {
    let blocker: string | null = null;
    // Check EXACT first (cheaper, exact match)
    for (const p of prodExact) {
      if (norm(p.keyword) === norm(r.keyword)) {
        blocker = `${p.keyword} [EXACT] in ${p.listName}`;
        break;
      }
    }
    if (!blocker) {
      for (const p of prodPhrase) {
        if (blocksSearch(p.keyword, "PHRASE", r.keyword)) {
          blocker = `${p.keyword} [PHRASE] in ${p.listName}`;
          break;
        }
      }
    }
    if (blocker) covered.push({ row: r, blockedBy: blocker });
    else notCovered.push(r);
  }

  console.log("");
  console.log("=== Cross-check Summary ===");
  console.log(`Total in combined CSV:       ${rows.length}`);
  console.log(`Already covered by prod:     ${covered.length}`);
  console.log(`Not covered (candidates):    ${notCovered.length}`);

  // Breakdown of covered by which prod list
  const byList: Record<string, number> = {};
  for (const c of covered) {
    const ln = c.blockedBy.split(" in ").pop() || "unknown";
    byList[ln] = (byList[ln] || 0) + 1;
  }
  console.log("\n=== 'Covered' breakdown by prod list ===");
  for (const [l, n] of Object.entries(byList)) console.log(`  ${l}: ${n}`);

  // Write output CSV (all rows, with new action column)
  const outLines = ["keyword,matchType,source_list,action,blocked_by"];
  for (const r of notCovered) {
    const needsQuote = r.keyword.includes(",") || r.keyword.includes('"');
    const kw = needsQuote ? `"${r.keyword.replace(/"/g, '""')}"` : r.keyword;
    outLines.push(`${kw},${r.matchType},${r.sourceList},keep,`);
  }
  for (const c of covered) {
    const needsQuote = c.row.keyword.includes(",") || c.row.keyword.includes('"');
    const kw = needsQuote ? `"${c.row.keyword.replace(/"/g, '""')}"` : c.row.keyword;
    const blockedByEsc = c.blockedBy.includes(",") ? `"${c.blockedBy.replace(/"/g, '""')}"` : c.blockedBy;
    outLines.push(`${kw},${c.row.matchType},${c.row.sourceList},already_in_prod,${blockedByEsc}`);
  }
  writeFileSync(OUT_CSV, outLines.join("\n") + "\n");
  console.log(`\nOutput CSV: ${OUT_CSV}`);
  console.log(`  - keep (not covered): ${notCovered.length} rows`);
  console.log(`  - already_in_prod:   ${covered.length} rows`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });