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
  console.log("commercialMeta:", JSON.stringify(p.commercialMeta));
  console.log("commercialNote:", JSON.stringify(p.commercialNote));
  console.log("\ncommercialPhases:");
  for (const phase of p.commercialPhases ?? []) {
    console.log(`  tier=${JSON.stringify(phase.tier)}  name=${JSON.stringify(phase.name)}  amount=${JSON.stringify(phase.amount)}  amountSub=${JSON.stringify(phase.amountSub)}  featured=${phase.featured}`);
    for (const f of phase.features ?? []) console.log(`    - ${f.item}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
