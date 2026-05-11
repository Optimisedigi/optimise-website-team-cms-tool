"use client";

import "./globals.css";
import {
  CoverSlide,
  LeadsSlide,
  LineChart,
  NextSlide,
  PrintStyles,
  ProgressBar,
  SearchTermsSlide,
  ShippedSlide,
  Slide,
  SlideHeading,
  SlideSubtext,
} from "../_deck-primitives";

const SLIDES = [
  "cover",
  "shipped",
  "channel",
  "leads",
  "keywords",
  "next",
];

export default function MtpDeckPage() {
  return (
    <div>
      <PrintStyles />
      <ProgressBar />

      {/* 1. Cover */}
      <CoverSlide slides={SLIDES} clientName="Malcolm Thompson Pumps" />

      {/* 2. What we shipped, what it produced */}
      <ShippedSlide
        id="shipped"
        slides={SLIDES}
        client="MTP"
        did={[
          "Audited every top landing page and the search intent feeding it",
          "Rebuilt the campaign structure end to end (Brand and Generic split)",
          "Rebuilt lead tracking, phone calls and form submissions, verified",
          "Wrote new ad copy across every ad group",
          "Built and applied negative keyword lists",
          "Added phrase match keyword coverage (15 added)",
        ]}
        produced={[
          <><strong>29 leads</strong> since 10 April (14 form, 15 phone)</>,
          <><strong>Account level cost per lead, $81 in April 2026</strong></>,
          <><strong>Paid sessions in April, 5.8 times March</strong></>,
          <><strong>Lead tracking firing correctly</strong>, the first trustworthy baseline the account has had</>,
          <><strong>Brand campaigns drove 68 percent of leads</strong></>,
        ]}
      />

      {/* 3. Traffic by channel */}
      <Slide id="channel" slides={SLIDES}>
        <SlideHeading>MTP, the traffic drop by channel</SlideHeading>
        <SlideSubtext>
          Sessions by channel, January 2025 to April 2026. The August 2025 site event is the dominant feature.
        </SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Paid Search", color: "rgb(37,99,235)", values: [2752,2348,2816,2488,3107,2527,1550,2,773,930,778,160,124,6,87,451] },
            { name: "Organic", color: "rgb(16,185,129)", values: [1895,1961,1911,1569,1721,1192,776,1,589,1021,951,687,732,280,367,612] },
            { name: "Direct", color: "rgb(245,158,11)", values: [1276,1034,1484,767,637,1022,491,5,408,796,1927,1416,551,579,561,1355] },
            { name: "Referral", color: "rgb(168,85,247)", values: [47,111,80,45,32,111,81,0,84,159,73,156,31,28,26,63] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
          <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1">
              The big issue
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              Organic search is still 60 to 70 percent below the pre August baseline. This is the long term gap and needs to be fixed. Pre August baseline was 3,500 to 4,000 sessions per month, today MTP sits at 1,216.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
              The good sign
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              Paid search is picking up again, April was 5.8 times March. Direct traffic is back to normal too, which means brand awareness is healthy. The new campaign structure is doing its job.
            </p>
          </div>
        </div>
      </Slide>

      {/* 4. Leads */}
      <LeadsSlide
        id="leads"
        slides={SLIDES}
        client="MTP"
        forms={14}
        phones={15}
        total={29}
        copy="These are the leads coming directly through Google Ads, based on what we are tracking. 29 leads since the new structure went live on 10 April, the first clean baseline the account has had. The next step is confirming with the MTP sales team that these leads are landing in inboxes and phones, and being followed up."
      />

      {/* 5. Keywords */}
      <SearchTermsSlide
        id="keywords"
        slides={SLIDES}
        client="MTP"
        subtitle="The people clicking on MTP ads are searching for the brands MTP stocks (Grundfos, Southern Cross) and the services MTP provides (water pump repairs, bore pump repairs, near me). This is high quality traffic that Google Ads is putting through."
        stats={[
          { v: "760", l: "Distinct searches" },
          { v: "$3,172", l: "Spend (April)" },
          { v: "449", l: "Clicks" },
          { v: "39", l: "Leads (April)" },
          { v: "$81", l: "Account CPA" },
        ]}
        rows={[
          { term: "grundfos", clicks: 71, spend: 527, leads: 10 },
          { term: "water pump repairs near me", clicks: 27, spend: 249, leads: 0 },
          { term: "grundfos pumps", clicks: 44, spend: 227, leads: 7 },
          { term: "grundfos australia", clicks: 15, spend: 149, leads: 1 },
          { term: "southern cross pumps", clicks: 18, spend: 108, leads: 0 },
          { term: "water tank pump repairs near me", clicks: 11, spend: 99, leads: 2 },
          { term: "pump repairs near me", clicks: 13, spend: 97, leads: 2 },
          { term: "water pump replacement", clicks: 5, spend: 95, leads: 1 },
          { term: "grundfos pumps australia", clicks: 13, spend: 78, leads: 4 },
          { term: "bore pump repairs near me", clicks: 4, spend: 49, leads: 0 },
          { term: "grundfos pumps perth", clicks: 4, spend: 37, leads: 1 },
          { term: "grundfos water pump", clicks: 13, spend: 32, leads: 2 },
        ]}
      />

      {/* 6. What is next */}
      <NextSlide
        id="next"
        slides={SLIDES}
        client="MTP"
        items={[
          [
            "Landing page fixes",
            "Fixing the top problem pages, missing forms, generic vocabulary, weak emergency intent.",
            "We are paying for clicks that land on pages that struggle to convert. Biggest single lift available.",
          ],
          [
            "New ad copy and ad groups",
            'Fresh ad copy aligned to landing page intent, plus new ad groups for solar pumps and "near me" geo routing.',
            "Captures the emerging solar and local intent that today lands on the wrong page.",
          ],
          [
            "Negative keyword pruning",
            "Weekly review of search terms to filter out irrelevant queries.",
            "Keeps spend on commercial intent only.",
          ],
          [
            "Budget reallocation",
            "Shift spend from zero converting campaigns into the campaigns producing leads.",
            "Brand campaigns drove 68 percent of MTP leads in April. There is headroom to do more there.",
          ],
          [
            "SEO recovery",
            "Free SEO audit across the site. Diagnose the August 2025 event.",
            "The biggest long term lever. Organic traffic is 60 to 70 percent below baseline, fixing it is worth more than any paid optimisation.",
          ],
          [
            "Lead validation with the MTP sales team",
            "Confirm the 29 leads are landing in inboxes and phones, and being followed up.",
            "If leads are arriving and converting, the reporting is trustworthy. If not, it points to a CRM or routing issue to fix together.",
          ],
        ]}
      />
    </div>
  );
}
