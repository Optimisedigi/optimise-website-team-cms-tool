import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Change the match type of an existing keyword in a negative keyword list.
 * Usage:
 *   npm run tsx -- scripts/update-consultant-match.ts <listName> <keyword> <fromMatchType> <toMatchType>
 *   npm run tsx -- scripts/update-consultant-match.ts "[OD] Account wide negatives" consultant phrase exact
 */

const [, , listName, keyword, fromMatchType, toMatchType] = process.argv;
if (!listName || !keyword || !fromMatchType || !toMatchType) {
  console.error("Usage: npm run tsx -- scripts/update-consultant-match.ts <listName> <keyword> <fromMatchType> <toMatchType>");
  process.exit(1);
}

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: "away-digital" } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const list = (await payload.find({
    collection: "negative-keyword-lists",
    where: { and: [{ client: { equals: client.id } }, { name: { equals: listName } }] },
    limit: 1,
    overrideAccess: true,
  })).docs[0] as any;
  if (!list) throw new Error(`List not found: ${listName}`);

  const kws: any[] = Array.isArray(list.keywords) ? list.keywords : [];
  const k = keyword.toLowerCase();
  const from = fromMatchType.toLowerCase();
  const to = toMatchType.toLowerCase();

  const idx = kws.findIndex((kw) => String(kw.keyword || "").toLowerCase() === k && String(kw.matchType || "").toLowerCase() === from);
  if (idx < 0) {
    console.log(`No matching row found in ${listName}: "${keyword}" [${fromMatchType}]`);
    process.exit(0);
  }
  console.log(`Found at index ${idx}: ${kws[idx].keyword} [${kws[idx].matchType}]`);
  kws[idx] = { ...kws[idx], matchType: to };
  await payload.update({ collection: "negative-keyword-lists", id: list.id, data: { keywords: kws }, overrideAccess: true });
  console.log(`Updated to [${toMatchType}]`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });