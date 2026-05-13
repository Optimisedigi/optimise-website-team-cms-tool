/**
 * Two clarifications on the in-the-picture proposal's Commercial Model slide
 * (slide 24), driven by Q&A with the prospect's partner:
 *
 *   1. Make it explicit that Phase 01 (Build & Launch, $16,000 one-time) is
 *      additional to the monthly retainer, not instead of it. We tweak the
 *      card's `amountSub` so it reads "one-time, plus retainer".
 *
 *   2. Make it explicit that the $2,500 / $4,600 / $6,400 monthly figures are
 *      management / service fees only \u2014 they do not include ad spend, which
 *      is paid directly to the ad networks. We append "\u00b7 management fee" to
 *      each retainer card's `amountSub` and add a slide-level `commercialNote`
 *      summarising the same point.
 *
 * Idempotent: skips updates when the target strings are already in place.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/update-itp-commercial-clarifications.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

type Phase = {
  tier?: string | null;
  name?: string | null;
  amount?: string | null;
  amountSub?: string | null;
  featured?: boolean | null;
  features?: Array<{ item?: string | null }> | null;
};

const PHASE_SUB_UPDATES: Record<string, string> = {
  "PHASE 01": "one-time, plus retainer",
  "PHASE 02 \u00b7 OPTION A": "/ month \u00b7 management fee",
  "PHASE 02 \u00b7 OPTION B": "/ month \u00b7 management fee \u00b7 Recommended",
  "PHASE 02 \u00b7 OPTION C": "/ month \u00b7 management fee",
};

const COMMERCIAL_NOTE =
  "Monthly retainers cover management and service only. Ad spend is paid directly to Google, Meta and LinkedIn, separate from the retainer.";

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
    commercialPhases?: Phase[] | null;
    commercialNote?: string | null;
  };
  if (!proposal) {
    console.error("Proposal 'in-the-picture' not found");
    process.exit(1);
  }

  const phases: Phase[] = Array.isArray(proposal.commercialPhases)
    ? proposal.commercialPhases
    : [];

  console.log(`Proposal id=${proposal.id} (${proposal.businessName})`);
  console.log(`Phases on record: ${phases.length}`);

  /** Strip em / en dashes from any string field. The deck-wide rule is
   *  "no en/em dashes anywhere"; the Commercial slide reads raw data so we
   *  scrub at the source. Replaces " \u2014 " with ": " (clause break becomes a
   *  label/value separator, which reads naturally for tier names like
   *  "Growth Retainer \u2014 SEO + Google Ads" \u2192 "Growth Retainer: SEO + Google
   *  Ads"). Bare dashes become hyphens as a last resort. */
  function stripDashes(value: string | null | undefined): string {
    if (!value) return value ?? "";
    let s = value;
    s = s.replace(/\s*[\u2014\u2013]\s*/g, ": ");
    s = s.replace(/[\u2014\u2013]/g, "-");
    s = s.replace(/\s{2,}/g, " ").trim();
    return s;
  }

  const updatedPhases = phases.map((phase) => {
    const tier = phase.tier ?? "";
    const target = PHASE_SUB_UPDATES[tier];

    // Scrub em-dashes from every visible string on the card.
    const cleaned: Phase = {
      ...phase,
      tier: stripDashes(phase.tier),
      name: stripDashes(phase.name),
      amount: stripDashes(phase.amount),
      amountSub: stripDashes(phase.amountSub),
      features: (phase.features ?? []).map((f) => ({
        ...f,
        item: stripDashes(f.item),
      })),
    };

    if ((phase.name ?? "") !== (cleaned.name ?? "")) {
      console.log(`  \u2022 NAME ${tier}`);
      console.log(`      before: ${JSON.stringify(phase.name)}`);
      console.log(`      after:  ${JSON.stringify(cleaned.name)}`);
    }

    if (target === undefined) return cleaned;

    const before = cleaned.amountSub ?? "";
    if (before === target) {
      console.log(`  \u2022 SKIP ${tier} \u2014 amountSub already "${target}"`);
      return cleaned;
    }
    console.log(`  \u2022 SUB  ${tier}`);
    console.log(`      before: ${JSON.stringify(before)}`);
    console.log(`      after:  ${JSON.stringify(target)}`);
    return { ...cleaned, amountSub: target };
  });

  const data: Record<string, unknown> = { commercialPhases: updatedPhases };

  const currentNote = (proposal.commercialNote ?? "").trim();
  if (currentNote === COMMERCIAL_NOTE) {
    console.log(`\ncommercialNote already in place \u2014 leaving as-is.`);
  } else {
    console.log(
      `\ncommercialNote: ${JSON.stringify(currentNote || "(empty)")} \u2192 set`,
    );
    data.commercialNote = COMMERCIAL_NOTE;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload as any).update({
    collection: "client-proposals",
    id: proposal.id,
    overrideAccess: true,
    data,
  });

  console.log(`\n\u2705 Commercial Model slide updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
