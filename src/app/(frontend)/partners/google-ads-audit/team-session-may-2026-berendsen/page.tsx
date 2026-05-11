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
  "channel-au",
  "channel-nsw",
  "leads",
  "keywords",
  "keywords-yoy",
  "next",
];

export default function BerendsenDeckPage() {
  return (
    <div>
      <PrintStyles />
      <ProgressBar />

      {/* 1. Cover */}
      <CoverSlide slides={SLIDES} clientName="Berendsen Fluid Power" />

      {/* 2. What we shipped, what it produced */}
      <ShippedSlide
        id="shipped"
        slides={SLIDES}
        client="Berendsen"
        did={[
          "Audited every top landing page and the search intent feeding it",
          "Rebuilt the campaign structure end to end (Brand and Generic split)",
          "Rebuilt lead tracking, phone calls and form submissions, verified",
          "Wrote new ad copy across every ad group",
          "Built and applied negative keyword lists (43 added)",
          "Added phrase match keyword coverage (28 added)",
          'Closed brand defence leak, "berendsen" phrase negative added',
        ]}
        produced={[
          <><strong>47 leads</strong> since 10 April (12 form, 35 phone)</>,
          <><strong>Account level cost per lead, $146 in April 2026</strong></>,
          <><strong>Australia-wide paid sessions in April, highest in 16 months</strong> (877, up 36 percent on March)</>,
          <><strong>Brand defence leak closed</strong>, around 142 own brand clicks per month no longer leaking out of brand campaigns</>,
          <><strong>Lead tracking firing correctly</strong>, the first trustworthy baseline the account has had</>,
        ]}
      />

      {/* 3. NEW Australia-wide channel slide */}
      <Slide id="channel-au" slides={SLIDES}>
        <SlideHeading>Berendsen Australia, the full traffic picture by channel</SlideHeading>
        <SlideSubtext>
          Sessions by channel, all of Australia, January 2025 to April 2026. This is the big picture before we zoom into Sydney.
        </SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Organic Search", color: "rgb(16,185,129)", values: [5528,5783,5502,5243,5642,5687,5336,1521,2579,3988,2709,3393,3805,4127,4309,3991], labelIndices: [6, 15] },
            { name: "Direct", color: "rgb(245,158,11)", values: [643,681,1465,587,697,678,750,198,1992,2944,2282,2393,2366,2643,2251,3242], labelIndices: [6, 15] },
            { name: "Paid Search", color: "rgb(37,99,235)", values: [1090,1026,1097,826,678,615,652,205,456,594,203,563,561,685,643,877], labelIndices: [6, 14, 15] },
            { name: "Display", color: "rgb(168,85,247)", values: [618,595,694,1395,822,861,948,185,269,138,0,558,1409,1354,952,134] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
              Paid search is the strongest in 16 months
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              April 2026 paid search hit <strong>877 sessions Australia wide</strong>, up 36 percent on March (643) and the highest since January 2025. Direct traffic also jumped 44 percent month on month, brand awareness is healthy.
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1">
              The remaining gap is organic search
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              Organic was around 5,500 sessions per month pre August, sits at 3,991 today. Roughly 25 to 30 percent below baseline. This is the channel that has not recovered and is the largest long term lever.
            </p>
          </div>
        </div>
      </Slide>

      {/* 4. NSW channel slide, reframed as a Sydney-specific call out */}
      <Slide id="channel-nsw" slides={SLIDES} light>
        <SlideHeading>Sydney is the exception, not a paid search problem</SlideHeading>
        <SlideSubtext>
          The Sydney branch saw cash sales drop in April. Looking at NSW only sessions, paid search in NSW did soften slightly while paid search Australia wide hit its strongest month in 16 months. The issue is a Sydney specific demand or fulfilment one, not a paid search one.
        </SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Organic Search", color: "rgb(16,185,129)", values: [1051,1159,1110,979,1044,1016,1099,302,485,820,589,708,713,759,861,779], labelIndices: [3, 15] },
            { name: "Paid Search", color: "rgb(37,99,235)", values: [255,260,244,244,229,199,228,82,146,225,69,175,151,206,187,279], labelIndices: [3, 15] },
            { name: "Direct", color: "rgb(245,158,11)", values: [99,92,108,118,114,107,113,30,127,179,154,153,208,236,185,185] },
            { name: "Display", color: "rgb(168,85,247)", values: [201,130,194,440,245,227,309,56,92,38,0,84,6,1,2,31] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <div className="mt-5 rounded-lg border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 p-4 max-w-4xl mx-auto w-full">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2">
            The Sydney call out
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-100">
            NSW paid sessions hit 279 in April, the strongest since April 2025, so paid <strong>is</strong> picking up in Sydney too. If Sydney cash sales dropped despite this, the cause sits outside the Google Ads account. It is either a Sydney branch sales or fulfilment issue, a CRM or lead routing gap, or a different demand pattern (commercial vs residential, project timing). It is not a paid search problem. The next step is reconciling the 47 leads with the Sydney branch directly.
          </p>
        </div>
      </Slide>

      {/* 5. Leads */}
      <LeadsSlide
        id="leads"
        slides={SLIDES}
        client="Berendsen"
        forms={12}
        phones={35}
        total={47}
        copy="These are the leads coming directly through Google Ads, based on what we are tracking. 47 leads since the new structure went live on 10 April, around 75 percent phone calls, typical for this industry. Same next step as MTP, confirm with the Berendsen sales team that these calls are arriving and being followed up at branch level."
      />

      {/* 6. Keywords */}
      <SearchTermsSlide
        id="keywords"
        slides={SLIDES}
        client="Berendsen"
        subtitle="The people clicking on Berendsen ads are searching for exactly the products and services Berendsen sells, hydraulic repairs, hydraulic seals, hydraulic cylinders, and the brands Berendsen stocks. This is high quality traffic that Google Ads is putting through."
        stats={[
          { v: "1,610", l: "Distinct searches" },
          { v: "$3,357", l: "Spend (April)" },
          { v: "755", l: "Clicks" },
          { v: "23", l: "Leads (April)" },
          { v: "$146", l: "Account CPA" },
        ]}
        rows={[
          { term: "hydraulic repairs near me", clicks: 40, spend: 294, leads: 0 },
          { term: "ag cylinders", clicks: 4, spend: 182, leads: 0 },
          { term: "hydraulic seals australia", clicks: 22, spend: 178, leads: 0 },
          { term: "hydraulic ram repairs", clicks: 24, spend: 148, leads: 1 },
          { term: "hydraulic ram repairs near me", clicks: 21, spend: 114, leads: 1 },
          { term: "berendsen fluid power", clicks: 92, spend: 112, leads: 9 },
          { term: "hydraulic cylinder repairs near me", clicks: 17, spend: 97, leads: 0 },
          { term: "hydraulic seals", clicks: 11, spend: 86, leads: 0 },
          { term: "cylinder repair melbourne", clicks: 2, spend: 64, leads: 2 },
          { term: "hydraulic shop near me", clicks: 20, spend: 64, leads: 0 },
          { term: "hydraulic cylinder repair", clicks: 8, spend: 53, leads: 0 },
          { term: "rexroth australia", clicks: 4, spend: 25, leads: 0 },
        ]}
      />

      {/* 7. Keyword YoY comparison */}
      <Slide id="keywords-yoy" slides={SLIDES}>
        <SlideHeading>Berendsen keywords, April 2025 vs April 2026</SlideHeading>
        <SlideSubtext>
          Compared to April last year, Berendsen is now paying for keywords on Google search that are much more relevant to the business. In April 2025 the account was paying for searches that had nothing to do with Berendsen (pipe fittings, pipe welding, stainless steel fabrication). In April 2026, every top spending search is a hydraulic repair, hydraulic seal, or branded hydraulic product query.
        </SlideSubtext>

        <div className="max-w-5xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 overflow-hidden">
              <div className="px-4 py-2 bg-amber-100 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                  April 2025, old account
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40 bg-white dark:bg-slate-900">
                  {[
                    { t: "pps townsville", s: 137, bad: true },
                    { t: "hydraulic ram repairs near me", s: 104 },
                    { t: "hydraulic ram repairs perth", s: 84 },
                    { t: "berendsen fluid power", s: 74 },
                    { t: "hydraulic cylinder repairs perth", s: 59 },
                    { t: "phoenix metalform", s: 41, bad: true },
                    { t: "pipe fittings", s: 37, bad: true },
                    { t: "mechanical contractors sydney", s: 21, bad: true },
                    { t: "pipe welding", s: 13, bad: true },
                    { t: "custom stainless steel fabricator", s: 10, bad: true },
                  ].map((r) => (
                    <tr key={r.t}>
                      <td
                        className={`px-4 py-1.5 ${
                          r.bad ? "text-rose-700 dark:text-rose-400 font-medium" : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {r.t}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                        ${r.s}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 overflow-hidden">
              <div className="px-4 py-2 bg-emerald-100 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
                  April 2026, new structure
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/40 bg-white dark:bg-slate-900">
                  {[
                    ["hydraulic repairs near me", 294],
                    ["ag cylinders", 182],
                    ["hydraulic seals australia", 178],
                    ["hydraulic ram repairs", 148],
                    ["berendsen fluid power", 112],
                    ["hydraulic cylinder repairs near me", 97],
                    ["hydraulic seals", 86],
                    ["hydraulic shop near me", 64],
                    ["rexroth australia", 25],
                    ["danfoss hydraulics", 26],
                  ].map(([t, s]) => (
                    <tr key={String(t)}>
                      <td className="px-4 py-1.5 text-slate-700 dark:text-slate-200">{t}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                        ${s}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 max-w-3xl mx-auto">
            <p className="text-xs text-slate-700 dark:text-slate-200">
              <strong>A note on counting leads.</strong> The old account was not measuring leads properly, so the old lead numbers cannot be trusted as a like for like measure of real customer enquiries. We fixed this on 25 March 2026, so from April onwards every lead in the report is a real phone call or form submission. That is why this slide compares the searches people are actually typing, not lead numbers, it is the only honest like for like view.
            </p>
          </div>
        </div>
      </Slide>

      {/* 8. What is next */}
      <NextSlide
        id="next"
        slides={SLIDES}
        client="Berendsen"
        items={[
          [
            "Landing page fixes",
            "Fixing the top problem pages, missing forms, wrong city in the headline, broken sections.",
            "We are paying for clicks that land on pages that cannot convert. Biggest single lift available.",
          ],
          [
            "New ad copy and ad groups",
            'Fresh ad copy aligned to landing page intent, plus new Hydraulic Seals ad group and "near me" geo routing.',
            'Around $264 a month already goes to "hydraulic seals" searches that land on the wrong page. Fixing this captures demand we are already paying for.',
          ],
          [
            "Negative keyword pruning",
            "Weekly review of search terms to filter out irrelevant queries.",
            "Keeps spend on commercial intent only.",
          ],
          [
            "Budget reallocation",
            "Shift spend from zero converting campaigns into the campaigns producing leads.",
            "A small number of campaigns are producing the bulk of the 47 Berendsen leads. There is headroom to do more there.",
          ],
          [
            "SEO recovery",
            "Free SEO audit across the site, same as MTP.",
            "Organic is the channel that has not recovered. Largest long term lever.",
          ],
          [
            "Sydney branch reconciliation",
            "Sit with the Sydney sales team and reconcile the 47 Google Ads leads against what the branch has actually received and quoted.",
            "Cash sales dropped in April, paid traffic did not. The cause sits outside Google Ads and needs to be diagnosed at branch level.",
          ],
        ]}
      />
    </div>
  );
}
