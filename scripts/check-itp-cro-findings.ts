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
  console.log("croAudit id:", p.croAudit);
  if (!p.croAudit) { process.exit(0); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cro = (await payload.findByID({ collection: "cro-audits", id: p.croAudit, overrideAccess: true })) as any;
  console.log("findings count:", (cro.findings ?? []).length);
  for (const f of cro.findings ?? []) {
    console.log(`  [${f.status}] ${f.message}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
