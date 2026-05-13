/**
 * Append two manual competitors (Nanak Accountants, Sleek) to the
 * competitor-analyses record linked to the "in-the-picture" proposal so they
 * appear in both the Competitor Analysis table and the Return Modelling slide.
 *
 * Idempotent: skips any competitor whose normalised domain already exists in
 * the array.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/add-itp-competitors.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

type CompetitorRow = {
  domain: string;
  avgPosition: number | null;
  keywordsFound: number | null;
  traffic: { monthlyVisits: number };
  metaAds: { isRunningAds: boolean };
  googleAds: { isRunningAds: boolean };
};

function normaliseDomain(value: string | null | undefined): string {
  if (!value) return "";
  let v = value.trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "");
  v = v.replace(/^www\./, "");
  v = v.replace(/[/?#].*$/, "");
  return v;
}

const NEW_COMPETITORS: CompetitorRow[] = [
  {
    domain: "nanakaccountants.com.au",
    avgPosition: null,
    keywordsFound: null,
    traffic: { monthlyVisits: 11000 },
    metaAds: { isRunningAds: false },
    googleAds: { isRunningAds: false },
  },
  {
    // Path kept so the slide link goes to the correct AU page; normaliseDomain
    // strips the path for dedupe.
    domain: "sleek.com/au",
    avgPosition: null,
    keywordsFound: null,
    traffic: { monthlyVisits: 1286 },
    metaAds: { isRunningAds: false },
    googleAds: { isRunningAds: false },
  },
];

async function main() {
  const payload = await getPayload({ config: payloadConfig });

  const proposalRes = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const proposal = proposalRes.docs[0] as unknown as {
    id: number;
    businessName: string;
    competitorAnalysis: number;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }

  const caId = proposal.competitorAnalysis;
  console.log(
    `Proposal id=${proposal.id} (${proposal.businessName}) → competitor-analyses id=${caId}`,
  );

  const ca = (await payload.findByID({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
  })) as unknown as {
    id: number;
    competitors?: CompetitorRow[] | null;
    totalCompetitorsFound?: number | null;
  };
  if (!ca) {
    console.error(`competitor-analyses ${caId} not found`);
    process.exit(1);
  }

  const existing: CompetitorRow[] = Array.isArray(ca.competitors)
    ? (ca.competitors as CompetitorRow[])
    : [];
  const existingDomains = new Set(
    existing.map((c) => normaliseDomain(c.domain)).filter(Boolean),
  );
  console.log(`Existing competitor count: ${existing.length}`);

  const toAppend: CompetitorRow[] = [];
  for (const row of NEW_COMPETITORS) {
    const key = normaliseDomain(row.domain);
    if (existingDomains.has(key)) {
      console.log(`  • SKIP ${row.domain} — already present`);
    } else {
      console.log(
        `  • ADD  ${row.domain} (${row.traffic.monthlyVisits.toLocaleString()} visits/mo)`,
      );
      toAppend.push(row);
      existingDomains.add(key);
    }
  }

  if (toAppend.length === 0) {
    console.log("Nothing to do — both competitors already present.");
    process.exit(0);
  }

  const merged = [...existing, ...toAppend];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = (await (payload as any).update({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
    data: {
      competitors: merged,
      totalCompetitorsFound: merged.length,
    },
  })) as { competitors?: CompetitorRow[] };

  const updatedCount = Array.isArray(updated.competitors)
    ? updated.competitors.length
    : 0;
  console.log(
    `\n✅ Updated competitor-analyses ${caId} — competitors: ${existing.length} → ${updatedCount}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
