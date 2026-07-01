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

function expectHostedLineCard(html: string, stroke: string, label: string, months = 3, options: { typedHeading?: boolean } = {}) {
  expect(html).toContain('font-family:Inter,Arial,sans-serif');
  expect(html).toContain('background:#ffffff;border:1px solid #e2e8f0;border-radius:16px');
  expect(html).toContain('box-shadow:0 10px 24px rgba(15,23,42,0.08)');
  expect(html).toContain(label);
  if (options.typedHeading) {
    expect(html).toContain(`<p style=\"margin:0 0 8px;font-family:Verdana,sans-serif;font-size:14px;color:#222\"><strong>${label}</strong></p>`);
    expect(html).not.toContain(`${months} month trend`);
    expect(html).not.toContain(`text-transform:uppercase;font-weight:700;color:#64748b\">${label}</div>`);
  } else {
    expect(html).toContain(`${months} month trend`);
  }
  expect(html).toContain('<img src="https://quickchart.io/chart?');
  expect(html).toContain('w=1040&amp;h=300&amp;devicePixelRatio=2');
  expect(html).toContain(`%22borderColor%22%3A%22${encodeURIComponent(stroke)}`);
  expect(html).toContain('style="display:block;width:100%;max-width:1040px;height:auto;border:0;outline:none;text-decoration:none"');
  expect(html).not.toContain('<svg');
  expect(html).not.toContain('<polyline');
  expect(html).not.toContain('>Month</th>');
  expect(html).not.toContain('>Trend</th>');
  expect(html).not.toContain('>Value</th>');
}

describe("Google Ads dashboard email graph renderer", () => {
  it("renders keyword relevancy as a template-style 14-month hosted graph image for Gmail", () => {
    const html = renderGoogleAdsEmailComponentHtml("keyword_relevancy", data);

    expectHostedLineCard(html, "#8b5cf6", "Keyword Relevancy", 14, { typedHeading: true });
    expect(html).toContain("Keyword Relevancy shows the share of non-brand search spend");
    expect(html).toContain('alt="Keyword Relevancy percentage over 14 months"');
    expect(html).toContain("96.7");
    expect(html).toContain("Feb%20'26");
    expect(html).not.toContain("Google Ads Dashboard Trend");
  });

  it("renders CPA trend as the preview-style hosted image line card", () => {
    const html = renderGoogleAdsEmailComponentHtml("cpa_trend", data);

    expectHostedLineCard(html, "#f59e0b", "Cost Per Acquisition", 3, { typedHeading: true });
    expect(html).toContain('alt="Cost per acquisition over 3 months"');
    expect(html).toContain("106%5D");
  });

  it("renders quality score trend as the preview-style hosted image line card", () => {
    const html = renderGoogleAdsEmailComponentHtml("quality_score", data);

    expectHostedLineCard(html, "#3b82f6", "Quality Score", 3, { typedHeading: true });
    expect(html).toContain('alt="Quality Score over 3 months"');
    expect(html).toContain("8.8");
  });
});
