import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

const EXPORT = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/.gg/uploads/mqgq8kaw-developer-it-au-negatives.csv";
const OUT = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/build/final/developer-it-au";
const DRY_RUN = process.argv.includes("--dry-run");
const CLIENT_SLUG = "away-digital";
const MAP: Record<string, string> = {
  ACCOUNT_WIDE: "[OD] Account wide negatives",
  GEO_COUNTRY_EXCLUSION: "[OD] Geo country exclusion",
};

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ',') { row.push(cell); cell = ""; continue; }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  return body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const payload = await getPayload({ config: payloadConfig });
  const clients = await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true });
  const client = clients.docs[0] as any;
  if (!client) throw new Error(`Client not found: ${CLIENT_SLUG}`);

  const rows = parseCsv(readFileSync(EXPORT, "utf8"))
    .filter((r) => MAP[r.target_list_or_scope])
    .map((r) => ({ ...r, keyword: r.keyword.trim(), matchType: r.match_type.trim().toLowerCase(), listName: MAP[r.target_list_or_scope] }));

  const summary: any[] = [];
  for (const listName of Array.from(new Set(rows.map((r) => r.listName)))) {
    const found = await payload.find({
      collection: "negative-keyword-lists",
      where: { and: [{ client: { equals: client.id } }, { name: { equals: listName } }] },
      limit: 1,
      overrideAccess: true,
    });
    const list = found.docs[0] as any;
    if (!list) throw new Error(`Negative keyword list not found for ${client.name}: ${listName}`);

    const existing = Array.isArray(list.keywords) ? list.keywords : [];
    const existingKeys = new Set(existing.map((kw: any) => `${String(kw.keyword || "").toLowerCase()}|${String(kw.matchType || "").toLowerCase()}`));
    const additions = rows
      .filter((r) => r.listName === listName)
      .filter((r) => !existingKeys.has(`${r.keyword.toLowerCase()}|${r.matchType}`))
      .map((r) => ({ keyword: r.keyword, matchType: r.matchType, flaggedForRemoval: false }));

    summary.push({ listName, listId: list.id, existingCount: existing.length, additions: additions.length, keywords: additions });
    if (!DRY_RUN && additions.length > 0) {
      await payload.update({
        collection: "negative-keyword-lists",
        id: list.id,
        data: { keywords: [...existing, ...additions] },
        overrideAccess: true,
      });
    }
  }

  writeFileSync(path.join(OUT, `cms-negative-import-${DRY_RUN ? "dry-run" : "apply"}.json`), JSON.stringify({ dryRun: DRY_RUN, client: { id: client.id, name: client.name, slug: client.slug }, summary }, null, 2));
  console.log(JSON.stringify({ dryRun: DRY_RUN, totalAdditions: summary.reduce((sum, s) => sum + s.additions, 0), summary: summary.map(({ keywords, ...s }) => s) }, null, 2));
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
