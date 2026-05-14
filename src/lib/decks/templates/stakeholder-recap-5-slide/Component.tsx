"use client";

/**
 * Live-rendered version of the 5-slide stakeholder/owner recap deck.
 *
 * Mirrors the JSX produced by `generateDeckTsx` in
 * `src/lib/agents/optimate-google-ads/apply-handlers/_deck-templates.ts`
 * but reads from `payload` at request time instead of writing a file
 * to disk. Reuses the existing slide primitives in
 * `src/app/(frontend)/partners/google-ads-audit/_deck-primitives.tsx`
 * verbatim — do NOT alter the primitives.
 *
 * The `produced` bullets accept inline **bold** markdown spans which we
 * compile to <strong> nodes at render time, matching the
 * `compileBoldFragment` helper used by the file emitter.
 */
import type { ReactNode } from "react";
import {
  CoverSlide,
  LeadsSlide,
  NextSlide,
  PrintStyles,
  ProgressBar,
  SearchTermsSlide,
  ShippedSlide,
} from "../../../../app/(frontend)/partners/google-ads-audit/_deck-primitives";
import { daysSinceLaunch } from "../../../agents/optimate-google-ads/apply-handlers/_deck-templates";
import type { DeckPayload } from "../../../agents/optimate-google-ads/apply-handlers/_deck-templates";

const SLIDES = ["cover", "shipped", "leads", "keywords", "next"];

/**
 * Compile a "produced" bullet that may contain inline **bold** markdown
 * into a React fragment. Same split rule as the file-emitter:
 * `**…**` runs become <strong>, plain runs become <span>.
 */
function renderProducedBullet(s: string): ReactNode {
  const parts = s.split(/\*\*([^*]+?)\*\*/g);
  return (
    <>
      {parts.map((seg, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{seg}</strong>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </>
  );
}

export function Component({ payload }: { payload: DeckPayload }) {
  const days = daysSinceLaunch(payload.launchDate, payload.reviewDate);
  const coverDaysLine = `${days} day${days === 1 ? "" : "s"} into the new structure`;

  return (
    <div data-deck-days={coverDaysLine}>
      <PrintStyles />
      <ProgressBar />

      {/* 1. Cover */}
      <CoverSlide slides={SLIDES} clientName={payload.clientName} />

      {/* 2. What we shipped, what it produced */}
      <ShippedSlide
        id="shipped"
        slides={SLIDES}
        client={payload.shortName}
        did={payload.shippedDid}
        produced={payload.shippedProduced.map(renderProducedBullet)}
      />

      {/* 3. Leads */}
      <LeadsSlide
        id="leads"
        slides={SLIDES}
        client={payload.shortName}
        forms={payload.formsLeads}
        phones={payload.phonesLeads}
        total={payload.formsLeads + payload.phonesLeads}
        copy={payload.leadsCopy}
      />

      {/* 4. Keywords */}
      <SearchTermsSlide
        id="keywords"
        slides={SLIDES}
        client={payload.shortName}
        subtitle={payload.keywordsSubtitle}
        stats={payload.keywordStats.map((s) => ({ v: s.value, l: s.label }))}
        rows={payload.keywordRows}
      />

      {/* 5. What is next */}
      <NextSlide
        id="next"
        slides={SLIDES}
        client={payload.shortName}
        items={payload.nextItems.map(
          (it) => [it.headline, it.what, it.why] as [string, string, string],
        )}
      />
    </div>
  );
}
