import { describe, expect, it } from "vitest";
import { renderGoogleAdsEmailComponentHtml, type GoogleAdsEmailComponentsData } from "@/lib/google-ads-email-components";

const relevancyLabels = ["Jan '25", "Feb '25", "Mar '25", "Apr '25", "May '25", "Jun '25", "Jul '25", "Aug '25", "Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26"];
const fourteenMonthRelevancy = [
  87.3, 93.6, 95.7, 95.4, 95.0, 95.1, 95.8, 96.4, 97.7, 97.8, 95.1, 96.9, 97.9, 96.7,
].map((value, index) => ({
  label: relevancyLabels[index]!,
  value,
}));

const data: GoogleAdsEmailComponentsData = {
  keywordRelevancyTrend: fourteenMonthRelevancy,
  cpaTrend: [
    { label: "Jan '26", value: 182 },
    { label: "Feb '26", value: 151 },
    { label: "Mar '26", value: 106 },
  ],
  qualityScore: {
    latestQualityScore: 8.8,
    latestMonth: "Mar '26",
    creativeQuality: 8.7,
    searchPredictedCtr: 8.9,
    landingPageQuality: 8.6,
    trend: [
      { label: "Jan '26", value: 6.1 },
      { label: "Feb '26", value: 7.4 },
      { label: "Mar '26", value: 8.8 },
    ],
  },
};

function expectSvgLineCard(html: string, gradientId: string, stroke: string, label: string) {
  expect(html).toContain('font-family:Inter,Arial,sans-serif');
  expect(html).toContain('background:#ffffff;border:1px solid #e2e8f0;border-radius:16px');
  expect(html).toContain('box-shadow:0 10px 24px rgba(15,23,42,0.08)');
  expect(html).toContain(label);
  expect(html).toContain('3 month trend');
  expect(html).toContain('<svg width="100%" viewBox="0 0 1040 300" role="img"');
  expect(html).toContain(`id="${gradientId}"`);
  expect(html).toContain('<line x1="55" x2="1010"');
  expect(html).toContain('<path d="M');
  expect(html).toContain(`fill="url(#${gradientId})"`);
  expect(html).toContain('<polyline points="');
  expect(html).toContain(`stroke="${stroke}" stroke-width="2.5"`);
  expect(html).toContain('<circle cx="');
  expect(html).toContain('rotate(-35');
  expect(html).not.toContain('>Month</th>');
  expect(html).not.toContain('>Trend</th>');
  expect(html).not.toContain('>Value</th>');
}

describe("Google Ads dashboard email graph renderer", () => {
  it("renders keyword relevancy as the exact preview-style 14-month SVG graph", () => {
    const html = renderGoogleAdsEmailComponentHtml("keyword_relevancy", data);

    expect(html).toContain("Keyword Relevancy");
    expect(html).toContain("14 month trend");
    expect(html).toContain("Keyword Relevancy shows the share of non-brand search spend");
    expect(html).toContain('<svg width="100%" viewBox="0 0 1040 300" role="img" aria-label="Keyword Relevancy percentage over 14 months"');
    expect(html).toContain('id="email-keyword-relevancy-grad"');
    expect(html).toContain('<polyline points="');
    expect(html).toContain('stroke="#8b5cf6" stroke-width="2.5"');
    expect(html).toContain("96.7%");
    expect(html).toContain("Feb &#39;26");
    expect(html).not.toContain("Google Ads Dashboard Trend");
  });

  it("renders CPA trend as the preview-style SVG line card", () => {
    const html = renderGoogleAdsEmailComponentHtml("cpa_trend", data);

    expectSvgLineCard(html, "email-cpa-trend-grad", "#f59e0b", "Cost Per Acquisition");
    expect(html).toContain('aria-label="Cost per acquisition over 3 months"');
    expect(html).toContain("$106");
  });

  it("renders quality score trend as the preview-style SVG line card", () => {
    const html = renderGoogleAdsEmailComponentHtml("quality_score", data);

    expectSvgLineCard(html, "email-quality-score-grad", "#3b82f6", "Quality Score");
    expect(html).toContain('aria-label="Quality Score over 3 months"');
    expect(html).toContain("8.8");
  });
});
