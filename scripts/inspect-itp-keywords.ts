import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";
async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const r = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0, limit: 1, overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = r.docs[0] as any;
  console.log("keywordCategories count:", (p.keywordCategories ?? []).length);
  for (const c of p.keywordCategories ?? []) {
    console.log(`  - "${c.categoryName}":`);
    console.log("     " + (c.keywords ?? "").split("\n").join("\n     "));
  }
  console.log("\nkeywordSnapshot id:", p.keywordSnapshot);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
