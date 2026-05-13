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
  console.log("roadmapMeta:", JSON.stringify(p.roadmapMeta));
  console.log("roadmapNote:", JSON.stringify(p.roadmapNote));
  console.log("roadmapTemplate:", JSON.stringify(p.roadmapTemplate));
  console.log("\nroadmapCells:");
  for (const c of p.roadmapCells ?? []) {
    console.log(JSON.stringify(c, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
