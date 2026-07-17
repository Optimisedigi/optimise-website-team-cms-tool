import { readFileSync } from "fs";
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Revert SNO round 1: remove the 158 entries added to [OD] Account wide negatives.
 * Identifies entries by matching keyword + matchType against the round's CMS import JSON.
 *
 * Usage:
 *   npm run tsx -- scripts/revert-sno-r1.ts
 */

const JSON_PATH = "/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools/scripts/audit-away-digital/data/negatives/cms-import/shared-negative-review-sno-r1-cms-import.json";
const ACCOUNT_WIDE = "[OD] Account wide negatives";
const CLIENT_SLUG = "away-digital";

async function main() {
  const cmsImport = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const roundKeys = new Set<string>();
  for (const s of cmsImport.summary || []) {
    for (const k of s.keywords || []) {
      roundKeys.add(`${String(k.keyword).trim().toLowerCase()}|${String(k.matchType).toLowerCase()}`);
    }
  }
  console.log(`Round adds: ${roundKeys.size} unique (keyword|matchType) pairs`);

  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: CLIENT_SLUG } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const list = (await payload.find({
    collection: "negative-keyword-lists",
    where: { and: [{ client: { equals: client.id } }, { name: { equals: ACCOUNT_WIDE } }] },
    limit: 1,
    overrideAccess: true,
  })).docs[0] as any;
  if (!list) throw new Error(`List not found: ${ACCOUNT_WIDE}`);

  const before = Array.isArray(list.keywords) ? list.keywords.length : 0;
  console.log(`Before: ${before} keywords in ${ACCOUNT_WIDE}`);

  const kept: any[] = [];
  let removed = 0;
  for (const kw of list.keywords) {
    const key = `${String(kw.keyword || "").trim().toLowerCase()}|${String(kw.matchType || "").toLowerCase()}`;
    if (roundKeys.has(key)) {
      removed++;
      continue;
    }
    kept.push(kw);
  }
  console.log(`Would remove: ${removed}`);
  console.log(`Would keep:   ${kept.length}`);

  await payload.update({ collection: "negative-keyword-lists", id: list.id, data: { keywords: kept }, overrideAccess: true });
  console.log(`Updated. New count: ${kept.length}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });