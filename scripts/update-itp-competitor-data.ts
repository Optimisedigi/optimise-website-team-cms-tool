/**
 * Two updates to the in-the-picture competitor-analyses record:
 *
 *   1. Populate `yourProfile.traffic.monthlyVisits` from
 *      `client-proposals.overrideMonthlyVisits` so the Competitor Analysis
 *      table (slide 9) shows ITP's own monthly visits — currently blank
 *      because yourProfile.traffic.monthlyVisits is undefined while
 *      ReturnModellingSlide uses the proposal-side override field.
 *
 *   2. Set ad flags on specific competitors per the team's manual review:
 *        hrblock         google=true,  meta=false
 *        etax            google=true   (meta unchanged)
 *        hnry            google=true,  meta=true
 *        sleek           google=true   (meta unchanged)
 *        azuregroup      google=true   (meta unchanged)
 *
 * Idempotent: writes the same booleans every run, no duplicates.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/update-itp-competitor-data.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

type AdsBlock = {
  isRunningAds?: boolean;
  adCount?: number;
  activeAdCount?: number;
  advertiserName?: string | null;
  adScreenshots?: unknown[];
} | null;

type CompetitorRow = {
  domain?: string;
  traffic?: { monthlyVisits?: number; [k: string]: unknown } | null;
  googleAds?: AdsBlock;
  metaAds?: AdsBlock;
  [k: string]: unknown;
};

type YourProfile = {
  domain?: string;
  traffic?: { monthlyVisits?: number; [k: string]: unknown } | null;
  [k: string]: unknown;
};

function normaliseDomain(value: string | null | undefined): string {
  if (!value) return "";
  let v = value.trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "");
  v = v.replace(/^www\./, "");
  v = v.replace(/[/?#].*$/, "");
  return v;
}

// Match keys are normalised domains. `undefined` means "leave as-is".
const AD_UPDATES: Record<
  string,
  { google?: boolean; meta?: boolean }
> = {
  "hrblock.com.au": { google: true, meta: false },
  "etax.com.au": { google: true },
  "hnry.com.au": { google: true, meta: true },
  "sleek.com": { google: true }, // sleek.com/au normalises to sleek.com
  "azuregroup.com.au": { google: true },
};

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
    overrideMonthlyVisits: number | null;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }
  console.log(
    `Proposal id=${proposal.id} (${proposal.businessName})`,
    `→ overrideMonthlyVisits=${proposal.overrideMonthlyVisits}`,
  );

  const caId = proposal.competitorAnalysis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ca = (await payload.findByID({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;

  // ---- 1. yourProfile.traffic.monthlyVisits ----
  const targetVisits = proposal.overrideMonthlyVisits;
  const currentVisits = ca.yourProfile?.traffic?.monthlyVisits;
  const yourProfile: YourProfile = ca.yourProfile ?? {
    domain: "inthepicture.com.au",
    traffic: null,
  };

  let yourProfileChanged = false;
  if (targetVisits != null && currentVisits !== targetVisits) {
    yourProfile.traffic = {
      ...(yourProfile.traffic ?? {}),
      monthlyVisits: targetVisits,
    };
    yourProfileChanged = true;
    console.log(
      `\n[1] yourProfile.traffic.monthlyVisits: ${currentVisits ?? "(empty)"} → ${targetVisits}`,
    );
  } else {
    console.log(
      `\n[1] yourProfile.traffic.monthlyVisits already ${currentVisits ?? "(empty)"} — no change`,
    );
  }

  // ---- 2. Competitor ad flags ----
  const competitors: CompetitorRow[] = Array.isArray(ca.competitors)
    ? (ca.competitors as CompetitorRow[])
    : [];
  console.log("\n[2] Ad flag updates:");

  const updatedCompetitors = competitors.map((c) => {
    const key = normaliseDomain(c.domain);
    const update = AD_UPDATES[key];
    if (!update) return c;

    const before = {
      google: c.googleAds?.isRunningAds ?? false,
      meta: c.metaAds?.isRunningAds ?? false,
    };

    const next: CompetitorRow = { ...c };

    if (update.google !== undefined) {
      next.googleAds = {
        ...(c.googleAds ?? {}),
        isRunningAds: update.google,
      };
    }
    if (update.meta !== undefined) {
      next.metaAds = {
        ...(c.metaAds ?? {}),
        isRunningAds: update.meta,
      };
    }

    const after = {
      google: next.googleAds?.isRunningAds ?? false,
      meta: next.metaAds?.isRunningAds ?? false,
    };
    const changed =
      before.google !== after.google || before.meta !== after.meta;
    console.log(
      `  ${changed ? "✓" : "•"} ${c.domain}  google: ${before.google}→${after.google}  meta: ${before.meta}→${after.meta}`,
    );

    return next;
  });

  // ---- Persist ----
  const data: Record<string, unknown> = {};
  if (yourProfileChanged) data.yourProfile = yourProfile;
  data.competitors = updatedCompetitors;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
    data,
  });

  console.log(`\n✅ competitor-analyses ${caId} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
