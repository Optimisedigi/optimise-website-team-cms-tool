import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

/**
 * Probe the production [OD] Account wide negatives list for the three keywords
 * the user asked about: airline, engagement activities, bruntwork (and the
 * phrase-match variants).
 */

const ACCOUNT_WIDE = "[OD] Account wide negatives";

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const client = (await payload.find({ collection: "clients", where: { slug: { equals: "away-digital" } }, limit: 1, overrideAccess: true })).docs[0] as any;
  if (!client) throw new Error("Client not found");

  const list = (await payload.find({
    collection: "negative-keyword-lists",
    where: { and: [{ client: { equals: client.id } }, { name: { equals: ACCOUNT_WIDE } }] },
    limit: 1,
    overrideAccess: true,
  })).docs[0] as any;
  if (!list) throw new Error("List not found");

  const kws: Array<{ keyword: string; matchType: string }> = Array.isArray(list.keywords) ? list.keywords : [];
  console.log(`Total keywords in ${ACCOUNT_WIDE}: ${kws.length}\n`);

  const needles = [
    "airline", "engagement activities", "bruntwork",
    "airline outsourcing", "engagement activities for remote teams",
  ];
  for (const needle of needles) {
    const n = needle.toLowerCase();
    const hits = kws.filter((k) => String(k.keyword || "").toLowerCase() === n);
    const partial = kws.filter((k) => String(k.keyword || "").toLowerCase().includes(n));
    console.log(`== "${needle}" ==`);
    if (hits.length) {
      for (const h of hits) console.log(`   EXACT MATCH: "${h.keyword}" [${h.matchType}]`);
    } else {
      console.log(`   no exact match in list`);
    }
    if (partial.length) {
      console.log(`   partial matches (substring):`);
      for (const p of partial) console.log(`     "${p.keyword}" [${p.matchType}]`);
    }
    console.log();
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
