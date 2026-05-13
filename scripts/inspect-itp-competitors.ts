/**
 * Inspect competitorAnalysis for the "in-the-picture" proposal so we know the
 * exact JSON shape before pushing new competitors into it.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/inspect-itp-competitors.ts
 */
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
  const proposal = proposalRes.docs[0] as any;
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }
  console.log("Proposal id:", proposal.id, "businessName:", proposal.businessName);
  console.log("competitorAnalysis rel id:", proposal.competitorAnalysis);

  const caRes = await payload.find({
    collection: "competitor-analyses",
    where: { id: { equals: proposal.competitorAnalysis } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const ca = caRes.docs[0] as any;
  if (!ca) {
    console.error("No competitor-analyses record for that id");
    process.exit(1);
  }

  console.log("\ncompetitor-analyses id:", ca.id);
  console.log("totalCompetitorsFound:", ca.totalCompetitorsFound);
  console.log("yourProfile keys:", Object.keys(ca.yourProfile ?? {}));
  console.log("\ncompetitors count:", (ca.competitors ?? []).length);
  console.log("\nFirst competitor (full JSON):");
  console.log(JSON.stringify((ca.competitors ?? [])[0], null, 2));
  console.log("\nAll competitor domains + visits:");
  for (const c of ca.competitors ?? []) {
    console.log(
      "  -",
      c.domain ?? "(no domain)",
      "→",
      c.traffic?.monthlyVisits ?? "(no visits)",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
