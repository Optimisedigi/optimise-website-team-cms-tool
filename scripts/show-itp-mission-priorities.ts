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
  for (const [i, mp] of (p.missionPriorities ?? []).entries()) {
    console.log(`\n[${i}] tag=${JSON.stringify(mp.tag)}`);
    console.log(`    title=${JSON.stringify(mp.title)}`);
    console.log(`    description=${mp.description}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
