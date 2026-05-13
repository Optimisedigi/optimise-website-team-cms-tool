/**
 * Rework the in-the-picture proposal's Roadmap slide (slide 21) so the flow
 * matches the partner-meeting decisions:
 *
 *   WEEK 01      Proposal & sign-off
 *   WEEK 02      Discovery, strategy & approval (collapsed from 2 cells)
 *   WEEK 03-06   Site build
 *   WEEK 07      SEO + Google Ads campaign build (launch + campaigns live)
 *   WEEK 08-12+  Optimise & scale (ongoing SEO + Google Ads optimisation)
 *
 * Replaces the prior build-launch template (which had discovery/approval as
 * separate cells and a single launch-and-optimise at the end).
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/update-itp-roadmap.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

type RoadmapCell = {
  week: string;
  step: string;
  body: string;
};

const NEXT: RoadmapCell[] = [
  {
    week: "WEEK 01",
    step: "Proposal & sign-off",
    body: "Agreement signed, project timeline confirmed, kickoff scheduled.",
  },
  {
    week: "WEEK 02",
    step: "Discovery, strategy & approval",
    body: "Site, competitor & market review. Sitemap, page structure, content plan and messaging framework presented and signed off before build begins.",
  },
  {
    week: "WEEK 03-06",
    step: "Site build",
    body: "Conversion-first build. CMS, secure forms, optimised content. Technical SEO and analytics wired in.",
  },
  {
    week: "WEEK 07",
    step: "Launch, SEO & Google Ads build",
    body: "Site goes live with SEO foundations rolled out. Google Ads campaigns built, conversion tracking validated, and ads launched.",
  },
  {
    week: "WEEK 08-12+",
    step: "Optimise & scale",
    body: "Ongoing SEO authority content rollout and Google Ads optimisation. Monthly performance reporting and continuous testing.",
  },
];

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
    businessName: string;
    roadmapCells?: Array<RoadmapCell & { id?: string }> | null;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }

  console.log(`Proposal id=${proposal.id} (${proposal.businessName})`);
  console.log(`\nBefore (${(proposal.roadmapCells ?? []).length} cells):`);
  for (const c of proposal.roadmapCells ?? []) {
    console.log(`  ${c.week.padEnd(12)} | ${c.step}`);
  }

  console.log(`\nAfter (${NEXT.length} cells):`);
  for (const c of NEXT) {
    console.log(`  ${c.week.padEnd(12)} | ${c.step}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "client-proposals",
    id: proposal.id,
    overrideAccess: true,
    data: { roadmapCells: NEXT, roadmapTemplate: "custom" },
  });

  console.log(`\n\u2705 Roadmap updated. Template flipped to 'custom' so the\n   defaults won't repopulate this row on a future save.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
