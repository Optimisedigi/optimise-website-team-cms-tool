import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const proposalRes = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = proposalRes.docs[0] as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ca = (await payload.findByID({
    collection: "competitor-analyses",
    id: p.competitorAnalysis,
    overrideAccess: true,
  })) as any;
  for (const c of ca.competitors ?? []) {
    const g = c.googleAds?.adScreenshots?.length ?? 0;
    const m = c.metaAds?.adScreenshots?.length ?? 0;
    if (g || m || c.googleAds?.isRunningAds || c.metaAds?.isRunningAds) {
      console.log(`${c.domain}  googleScreenshots=${g}  metaScreenshots=${m}  google=${c.googleAds?.isRunningAds}  meta=${c.metaAds?.isRunningAds}`);
      if (g > 0) console.log("  google sample:", JSON.stringify(c.googleAds.adScreenshots[0]).slice(0, 200));
      if (m > 0) console.log("  meta sample:", JSON.stringify(c.metaAds.adScreenshots[0]).slice(0, 200));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
