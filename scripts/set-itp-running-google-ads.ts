/**
 * Flip the in-the-picture proposal's own profile to "running Google Ads = Yes"
 * so the Competitor Analysis table (slide 9) shows "Yes" on the ITP row.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/set-itp-running-google-ads.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

async function main(): Promise<void> {
  const payload = await getPayload({ config: payloadConfig });

  const res = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const proposal = res.docs[0] as unknown as {
    id: number;
    competitorAnalysis: number;
  };
  if (!proposal) {
    console.error("Proposal not found");
    process.exit(1);
  }

  const caId = proposal.competitorAnalysis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ca = (await payload.findByID({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
  })) as unknown as {
    yourProfile?: {
      googleAds?: { isRunningAds?: boolean } | null;
      [k: string]: unknown;
    } | null;
  };

  const yourProfile = (ca.yourProfile ?? {}) as Record<string, unknown>;
  const currentGoogle =
    (yourProfile.googleAds as { isRunningAds?: boolean } | null)
      ?.isRunningAds ?? false;

  if (currentGoogle === true) {
    console.log("yourProfile.googleAds.isRunningAds already true. Nothing to do.");
    process.exit(0);
  }

  const nextProfile = {
    ...yourProfile,
    googleAds: {
      ...((yourProfile.googleAds as Record<string, unknown> | null) ?? {}),
      isRunningAds: true,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "competitor-analyses",
    id: caId,
    overrideAccess: true,
    data: { yourProfile: nextProfile },
  });

  console.log(`\u2705 yourProfile.googleAds.isRunningAds: ${currentGoogle} \u2192 true`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
