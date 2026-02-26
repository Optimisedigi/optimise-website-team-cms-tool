import { generateGoogleAdsAuditEmail } from "@/lib/google-ads-email-generator";
import type {
  GoogleAdsAuditResults,
  CurationSelections,
} from "@/lib/google-ads-types";

// ---------------------------------------------------------------------------
// Helpers to build test data
// ---------------------------------------------------------------------------

function makeStep(
  overrides: Partial<{
    step: number;
    name: string;
    score: number;
    findings: string[];
    recommendations: string[];
  }> = {},
) {
  return {
    step: overrides.step ?? 1,
    name: overrides.name ?? `Step ${overrides.step ?? 1}`,
    weight: 1,
    score: overrides.score ?? 5,
    maxScore: 10,
    findings: overrides.findings ?? ["Finding A", "Finding B"],
    recommendations: overrides.recommendations ?? ["Rec A", "Rec B"],
  };
}

function makeResults(
  overrides: Partial<GoogleAdsAuditResults> = {},
): GoogleAdsAuditResults {
  return {
    id: "audit-1",
    customerId: "123-456-7890",
    overallScore: overrides.overallScore ?? 55,
    steps: overrides.steps ?? [
      makeStep({ step: 1, name: "Conversion Tracking", score: 2 }),
      makeStep({ step: 2, name: "Campaign Structure", score: 4 }),
      makeStep({ step: 3, name: "Keyword Strategy", score: 6 }),
      makeStep({ step: 4, name: "Ad Copy", score: 7 }),
      makeStep({ step: 5, name: "Extensions", score: 8 }),
      makeStep({ step: 6, name: "Bidding", score: 3 }),
    ],
    quickWins: overrides.quickWins ?? [
      "Add negative keywords",
      "Enable sitelinks",
      "Fix conversion tracking",
    ],
    estimatedMonthlyWaste: overrides.estimatedMonthlyWaste ?? 1200,
    accountSummary: overrides.accountSummary ?? {
      totalCampaigns: 5,
      activeCampaigns: 3,
      totalKeywords: 200,
      totalSpend: 60000,
      totalConversions: 100,
      avgCpa: 120,
      dateRange: "2025-01-01 to 2025-12-31",
    },
    createdAt: "2025-12-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateGoogleAdsAuditEmail", () => {
  // -----------------------------------------------------------------------
  // Basic output structure
  // -----------------------------------------------------------------------

  it("returns a complete HTML document", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Acme Corp",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Google Ads Account Review");
  });

  it("includes the client name in the title", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Acme Corp",
    });
    expect(html).toContain("Google Ads Account Review — Acme Corp");
  });

  // -----------------------------------------------------------------------
  // Greeting
  // -----------------------------------------------------------------------

  it("uses contact name in greeting when provided", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Acme",
      contactName: "Jane",
    });
    expect(html).toContain("Hi Jane,");
  });

  it("falls back to generic greeting when no contact name", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Acme",
    });
    expect(html).toContain("<p>Hi,</p>");
  });

  // -----------------------------------------------------------------------
  // HTML escaping
  // -----------------------------------------------------------------------

  it("escapes HTML special characters in client name", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML special characters in contact name", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Acme",
      contactName: 'O"Brien & Co',
    });
    expect(html).toContain("O&quot;Brien &amp; Co");
  });

  it("escapes ampersands and quotes in findings", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          findings: ['Use "exact match" & BMM keywords'],
        }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("&quot;exact match&quot;");
    expect(html).toContain("&amp; BMM");
  });

  // -----------------------------------------------------------------------
  // Score badge color
  // -----------------------------------------------------------------------

  it("uses green badge for high overall score (>=70)", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ overallScore: 75 }),
      { clientName: "Test" },
    );
    expect(html).toContain("background:#2e7d32");
  });

  it("uses amber badge for medium overall score (45-69)", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ overallScore: 55 }),
      { clientName: "Test" },
    );
    expect(html).toContain("background:#f57c00");
  });

  it("uses red badge for low overall score (<45)", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ overallScore: 30 }),
      { clientName: "Test" },
    );
    expect(html).toContain("background:#d32f2f");
  });

  // -----------------------------------------------------------------------
  // Score color in table (per-step, max=10)
  // -----------------------------------------------------------------------

  it("uses green color for step score >= 7 (70% of 10)", () => {
    const results = makeResults({
      steps: [makeStep({ step: 1, score: 8, name: "Good Step" })],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("color:#2e7d32");
  });

  it("uses amber color for step score 5-6 (50-60% of 10)", () => {
    const results = makeResults({
      steps: [makeStep({ step: 1, score: 5, name: "Mid Step" })],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("color:#f57c00");
  });

  it("uses red color for step score <= 4 (<45% of 10)", () => {
    const results = makeResults({
      steps: [makeStep({ step: 1, score: 3, name: "Bad Step" })],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("color:#d32f2f");
  });

  // -----------------------------------------------------------------------
  // Worst-steps table (picks bottom 5 by score)
  // -----------------------------------------------------------------------

  it("shows the 5 lowest-scoring steps in the table", () => {
    const results = makeResults(); // 6 steps, scores: 2,4,6,7,8,3
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    // Worst 5 by score: 2, 3, 4, 6, 7 — excludes 8
    expect(html).toContain("Conversion Tracking"); // score 2
    expect(html).toContain("Bidding"); // score 3
    expect(html).toContain("Campaign Structure"); // score 4
    expect(html).toContain("Keyword Strategy"); // score 6
    expect(html).toContain("Ad Copy"); // score 7
    // Extensions (score 8) should not be in the table
    // However it may appear elsewhere — check it's not in a <tr>
    const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tableMatch).toBeTruthy();
    expect(tableMatch![1]).not.toContain("Extensions");
  });

  it("shows first finding as key issue when no curation", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          findings: ["First finding", "Second finding"],
        }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("First finding");
  });

  it("truncates long findings to 100 characters with ellipsis", () => {
    const longFinding = "A".repeat(120);
    const results = makeResults({
      steps: [
        makeStep({ step: 1, score: 1, findings: [longFinding] }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("A".repeat(97) + "...");
    expect(html).not.toContain("A".repeat(100));
  });

  it("does not truncate findings at exactly 100 characters", () => {
    const exactFinding = "B".repeat(100);
    const results = makeResults({
      steps: [
        makeStep({ step: 1, score: 1, findings: [exactFinding] }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("B".repeat(100));
    expect(html).not.toContain("B".repeat(97) + "...");
  });

  // -----------------------------------------------------------------------
  // Top recommendations (no curation)
  // -----------------------------------------------------------------------

  it("shows up to 3 recommendations from worst steps without curation", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          recommendations: ["Rec1-A", "Rec1-B"],
        }),
        makeStep({
          step: 2,
          score: 2,
          recommendations: ["Rec2-A", "Rec2-B"],
        }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("Rec1-A");
    expect(html).toContain("Rec1-B");
    expect(html).toContain("Rec2-A");
    // Only first 3
    expect(html).not.toContain("Rec2-B");
  });

  // -----------------------------------------------------------------------
  // Quick wins
  // -----------------------------------------------------------------------

  it("renders all quick wins without curation", () => {
    const results = makeResults({
      quickWins: ["QW1", "QW2", "QW3"],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("QW1");
    expect(html).toContain("QW2");
    expect(html).toContain("QW3");
  });

  // -----------------------------------------------------------------------
  // Curation: step findings
  // -----------------------------------------------------------------------

  it("uses curated finding indices for key issue column", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          findings: ["Not this one", "Pick me"],
        }),
      ],
    });
    const curation: CurationSelections = {
      stepFindings: { 1: [1] }, // index 1 = "Pick me"
      stepRecommendations: {},
      emailQuickWins: [],
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    expect(html).toContain("Pick me");
  });

  it("shows empty key issue when curation selects no findings for a step", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          findings: ["Finding A"],
        }),
      ],
    });
    const curation: CurationSelections = {
      stepFindings: { 1: [] },
      stepRecommendations: {},
      emailQuickWins: [],
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    // The finding cell should be empty (just the td tags)
    const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tableMatch).toBeTruthy();
    // "Finding A" should not appear in the table
    expect(tableMatch![1]).not.toContain("Finding A");
  });

  it("shows empty key issue when curation has no entry for the step", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          findings: ["Finding A"],
        }),
      ],
    });
    const curation: CurationSelections = {
      stepFindings: {}, // no entry for step 1
      stepRecommendations: {},
      emailQuickWins: [],
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tableMatch![1]).not.toContain("Finding A");
  });

  // -----------------------------------------------------------------------
  // Curation: recommendations
  // -----------------------------------------------------------------------

  it("uses curated recommendation indices for top recommendations", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          recommendations: ["RecA", "RecB", "RecC"],
        }),
        makeStep({
          step: 2,
          score: 3,
          recommendations: ["RecD", "RecE"],
        }),
      ],
    });
    const curation: CurationSelections = {
      stepFindings: {},
      stepRecommendations: {
        1: [2], // "RecC"
        2: [0], // "RecD"
      },
      emailQuickWins: [],
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    expect(html).toContain("RecC");
    expect(html).toContain("RecD");
    expect(html).not.toContain("RecA");
    expect(html).not.toContain("RecB");
  });

  it("limits curated recommendations to 3", () => {
    const results = makeResults({
      steps: [
        makeStep({
          step: 1,
          score: 1,
          recommendations: ["R1", "R2", "R3", "R4"],
        }),
      ],
    });
    const curation: CurationSelections = {
      stepFindings: {},
      stepRecommendations: { 1: [0, 1, 2, 3] }, // 4 selected
      emailQuickWins: [],
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    expect(html).toContain("R1");
    expect(html).toContain("R2");
    expect(html).toContain("R3");
    expect(html).not.toContain("R4");
  });

  // -----------------------------------------------------------------------
  // Curation: quick wins
  // -----------------------------------------------------------------------

  it("filters quick wins by curated indices", () => {
    const results = makeResults({
      quickWins: ["QW0", "QW1", "QW2", "QW3"],
    });
    const curation: CurationSelections = {
      stepFindings: {},
      stepRecommendations: {},
      emailQuickWins: [1, 3], // "QW1", "QW3"
      presentationQuickWins: [],
    };
    const html = generateGoogleAdsAuditEmail(results, { clientName: "T" }, curation);
    expect(html).toContain("QW1");
    expect(html).toContain("QW3");
    expect(html).not.toContain("QW0");
    expect(html).not.toContain("QW2");
  });

  // -----------------------------------------------------------------------
  // Opportunity section
  // -----------------------------------------------------------------------

  it("shows monthly waste when > $50", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ estimatedMonthlyWaste: 1200 }),
      { clientName: "Test" },
    );
    expect(html).toContain("$1,200/month");
    expect(html).toContain("wasted spend");
  });

  it("omits waste line when estimatedMonthlyWaste is null", () => {
    const results = makeResults();
    results.estimatedMonthlyWaste = null;
    const html = generateGoogleAdsAuditEmail(results, { clientName: "Test" });
    expect(html).not.toContain("wasted spend");
  });

  it("omits waste line when estimatedMonthlyWaste <= 50", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ estimatedMonthlyWaste: 50 }),
      { clientName: "Test" },
    );
    expect(html).not.toContain("wasted spend");
  });

  it("shows CPA reduction range when avgCpa is provided", () => {
    const results = makeResults({
      accountSummary: {
        totalCampaigns: 5,
        activeCampaigns: 3,
        totalKeywords: 200,
        totalSpend: 60000,
        totalConversions: 100,
        avgCpa: 100,
        dateRange: "2025-01-01 to 2025-12-31",
      },
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    // targetLow = 100*0.6 = 60, targetHigh = 100*0.75 = 75
    expect(html).toContain("$60");
    expect(html).toContain("$75");
    expect(html).toContain("currently $100");
  });

  it("omits CPA line when avgCpa is null", () => {
    const results = makeResults({
      accountSummary: {
        totalCampaigns: 5,
        activeCampaigns: 3,
        totalKeywords: 200,
        totalSpend: 60000,
        totalConversions: 100,
        avgCpa: null,
        dateRange: "2025-01-01 to 2025-12-31",
      },
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).not.toContain("Cost per lead potential");
  });

  it("always shows the ROI visibility line", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ estimatedMonthlyWaste: null }),
      { clientName: "Test" },
    );
    expect(html).toContain("Full visibility into ROI");
  });

  // -----------------------------------------------------------------------
  // Monthly spend calculation
  // -----------------------------------------------------------------------

  it("calculates monthly spend as totalSpend / 12", () => {
    const results = makeResults({
      accountSummary: {
        totalCampaigns: 1,
        activeCampaigns: 1,
        totalKeywords: 10,
        totalSpend: 120000,
        totalConversions: 50,
        avgCpa: null,
        dateRange: "range",
      },
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    // 120000 / 12 = 10000
    expect(html).toContain("$10,000/month");
  });

  // -----------------------------------------------------------------------
  // formatDollars
  // -----------------------------------------------------------------------

  it("formats large dollar amounts with commas", () => {
    const results = makeResults({
      estimatedMonthlyWaste: 15000,
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("$15,000/month");
  });

  // -----------------------------------------------------------------------
  // Presentation URL / CTA
  // -----------------------------------------------------------------------

  it("renders CTA button when presentationUrl is provided", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Test",
      presentationUrl: "https://example.com/audit",
    });
    expect(html).toContain('href="https://example.com/audit"');
    expect(html).toContain("View Full Audit Presentation");
  });

  it("omits CTA when no presentationUrl", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Test",
    });
    expect(html).not.toContain("View Full Audit Presentation");
  });

  it("escapes presentationUrl HTML characters", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Test",
      presentationUrl: 'https://example.com/audit?a=1&b="2"',
    });
    expect(html).toContain("a=1&amp;b=&quot;2&quot;");
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("handles zero overall score", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ overallScore: 0 }),
      { clientName: "Test" },
    );
    expect(html).toContain("0 / 100");
    // Red badge
    expect(html).toContain("background:#d32f2f");
  });

  it("handles 100 overall score", () => {
    const html = generateGoogleAdsAuditEmail(
      makeResults({ overallScore: 100 }),
      { clientName: "Test" },
    );
    expect(html).toContain("100 / 100");
    expect(html).toContain("background:#2e7d32");
  });

  it("handles steps with empty findings array", () => {
    const results = makeResults({
      steps: [makeStep({ step: 1, score: 1, findings: [] })],
    });
    // Should not throw
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("handles steps with empty recommendations array", () => {
    const results = makeResults({
      steps: [
        makeStep({ step: 1, score: 1, recommendations: [] }),
      ],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("handles empty quickWins array", () => {
    const results = makeResults({ quickWins: [] });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("Quick wins");
  });

  it("handles single step (fewer than 5)", () => {
    const results = makeResults({
      steps: [makeStep({ step: 1, score: 5, name: "Only Step" })],
    });
    const html = generateGoogleAdsAuditEmail(results, {
      clientName: "Test",
    });
    expect(html).toContain("Only Step");
  });

  it("handles curation with out-of-range indices gracefully", () => {
    const results = makeResults({
      steps: [
        makeStep({ step: 1, score: 1, findings: ["OnlyOne"] }),
      ],
      quickWins: ["QW0"],
    });
    const curation: CurationSelections = {
      stepFindings: { 1: [99] }, // out of range
      stepRecommendations: { 1: [99] },
      emailQuickWins: [99], // out of range
      presentationQuickWins: [],
    };
    // Should not throw
    const html = generateGoogleAdsAuditEmail(
      results,
      { clientName: "Test" },
      curation,
    );
    expect(html).toContain("<!DOCTYPE html>");
    // Out of range finding → empty
    const tableMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(tableMatch![1]).not.toContain("OnlyOne");
  });

  it("includes signoff with Peter and Optimise Digital", () => {
    const html = generateGoogleAdsAuditEmail(makeResults(), {
      clientName: "Test",
    });
    expect(html).toContain("Kind regards,");
    expect(html).toContain("Peter");
    expect(html).toContain("Optimise Digital");
    expect(html).toContain("www.optimisedigital.online");
  });
});
