/**
 * Tests for the generalised Weekly Metric Table renderer. Pure TS - no
 * Payload, no HTTP, no clock dependency. All cases pass `endDate` explicitly
 * so the suite is hermetic across timezones / CI clocks.
 */

import { describe, it, expect } from "vitest";
import {
  buildWeeklyBuckets,
  computeMetric,
  formatMetric,
  generateWeeklyMetricTableHtml,
  generateWeeklyTrendNoteHtml,
  buildWeeklyTrendRows,
  type WeeklyBucketRow,
  type WeeklyBucketTotals,
} from "@/lib/google-ads-weekly-metric-table";

function perDayRange(
  startIso: string,
  endIso: string,
  per: { spend: number; clicks: number; impressions: number; conversions: number },
): Array<{ date: string; spend: number; clicks: number; impressions: number; conversions: number }> {
  const out: Array<{
    date: string;
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
  }> = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    out.push({
      date: `${y}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`,
      ...per,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function bucket(
  weekStart: string,
  weekEnd: string,
  label: string,
  partial: boolean,
  totals: WeeklyBucketTotals,
): WeeklyBucketRow {
  return { weekStart, weekEnd, label, partial, totals };
}

describe("buildWeeklyBuckets", () => {
  it("sums spend/clicks/impressions/conversions correctly within each bucket and flags the latest partial week", () => {
    const rows = buildWeeklyBuckets({
      perDay: [
        // First full week: 7 days x ($100, 50c, 1000imp, 1conv) = $700, 350c, 7000imp, 7conv
        ...perDayRange("2026-05-11", "2026-05-17", {
          spend: 100,
          clicks: 50,
          impressions: 1000,
          conversions: 1,
        }),
        // Partial week (Mon-Wed): 3 days x ($200, 80c, 1500imp, 5conv) = $600, 240c, 4500imp, 15conv
        ...perDayRange("2026-05-18", "2026-05-20", {
          spend: 200,
          clicks: 80,
          impressions: 1500,
          conversions: 5,
        }),
      ],
      weeks: 2,
      endDate: "2026-05-20", // Wed
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].totals).toEqual({
      spend: 700,
      clicks: 350,
      impressions: 7000,
      conversions: 7,
    });
    expect(rows[0].partial).toBe(false);
    expect(rows[1].totals).toEqual({
      spend: 600,
      clicks: 240,
      impressions: 4500,
      conversions: 15,
    });
    expect(rows[1].partial).toBe(true);
    expect(rows[1].label).toBe("May 18 - 20 (Mon-Wed)");
  });
});

describe("computeMetric", () => {
  const t: WeeklyBucketTotals = {
    spend: 600,
    clicks: 200,
    impressions: 10_000,
    conversions: 4,
  };

  it("pass-through metrics return the raw totals", () => {
    expect(computeMetric("spend", t)).toBe(600);
    expect(computeMetric("clicks", t)).toBe(200);
    expect(computeMetric("impressions", t)).toBe(10_000);
    expect(computeMetric("conversions", t)).toBe(4);
  });

  it("cpa = cost/conv, null when conversions === 0", () => {
    expect(computeMetric("cpa", t)).toBe(150);
    expect(
      computeMetric("cpa", { spend: 600, clicks: 200, impressions: 10_000, conversions: 0 }),
    ).toBeNull();
  });

  it("cpc = cost/clicks (account-level, NOT passthrough avgCpc); null when clicks === 0", () => {
    expect(computeMetric("cpc", t)).toBe(3);
    expect(
      computeMetric("cpc", { spend: 600, clicks: 0, impressions: 10_000, conversions: 4 }),
    ).toBeNull();
  });

  it("ctr = clicks/impressions * 100; null when impressions === 0", () => {
    expect(computeMetric("ctr", t)).toBe(2);
    expect(
      computeMetric("ctr", { spend: 600, clicks: 50, impressions: 0, conversions: 4 }),
    ).toBeNull();
  });

  it("conv_rate = conv/clicks * 100; null when clicks === 0", () => {
    expect(computeMetric("conv_rate", t)).toBe(2);
    expect(
      computeMetric("conv_rate", {
        spend: 600,
        clicks: 0,
        impressions: 10_000,
        conversions: 4,
      }),
    ).toBeNull();
  });
});

describe("formatMetric", () => {
  it("formats per type and renders dash for nulls", () => {
    expect(formatMetric("spend", 1234)).toBe("$1,234");
    expect(formatMetric("spend", null)).toBe("-");
    expect(formatMetric("clicks", 1234)).toBe("1,234");
    expect(formatMetric("impressions", 1_234_000)).toBe("1,234,000");
    expect(formatMetric("conversions", 7)).toBe("7");
    expect(formatMetric("cpa", 123)).toBe("$123");
    expect(formatMetric("cpa", null)).toBe("-");
    expect(formatMetric("cpc", 1.234)).toBe("$1.23");
    expect(formatMetric("cpc", null)).toBe("-");
    expect(formatMetric("ctr", 1.234)).toBe("1.23%");
    expect(formatMetric("ctr", null)).toBe("-");
    expect(formatMetric("conv_rate", 2.5)).toBe("2.50%");
    expect(formatMetric("conv_rate", null)).toBe("-");
  });
});

describe("generateWeeklyMetricTableHtml - back-compat byte-identity", () => {
  // Same fixture as the legacy test - the new renderer with the legacy
  // metric set must produce byte-identical HTML so the deprecated tool's
  // observable output is unchanged.
  const legacyRows = [
    { weekStart: "2026-04-27", weekEnd: "2026-05-03", label: "Apr 27 - May 3", partial: false, spend: 850, conversions: 10, cpa: 85 },
    { weekStart: "2026-05-04", weekEnd: "2026-05-10", label: "May 4 - May 10", partial: false, spend: 1500, conversions: 10, cpa: 150 },
    { weekStart: "2026-05-11", weekEnd: "2026-05-17", label: "May 11 - May 17", partial: false, spend: 2410, conversions: 5, cpa: 482 },
    { weekStart: "2026-05-18", weekEnd: "2026-05-21", label: "May 18 - 21 (Mon-Wed)", partial: true, spend: 600, conversions: 4, cpa: 150 },
  ];

  it("is byte-identical to generateWeeklyTrendNoteHtml for matching input", () => {
    const fromNew = generateWeeklyMetricTableHtml({
      rows: legacyRows.map((r) => ({
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        label: r.label,
        partial: r.partial,
        totals: {
          spend: r.spend,
          clicks: 0,
          impressions: 0,
          conversions: r.conversions,
        },
      })),
      metrics: ["spend", "conversions", "cpa"],
    });
    const fromLegacy = generateWeeklyTrendNoteHtml({ rows: legacyRows });
    expect(fromNew).toBe(fromLegacy);
  });
});

describe("generateWeeklyMetricTableHtml - compare=wow compatibility", () => {
  // 4-week CPC fixture. Legacy callers may still pass compare="wow", but
  // the canonical table deliberately renders absolute metric values only.
  const rows: WeeklyBucketRow[] = [
    bucket("2026-04-27", "2026-05-03", "Apr 27 - May 3", false, {
      spend: 200,
      clicks: 100,
      impressions: 1000,
      conversions: 0,
    }),
    bucket("2026-05-04", "2026-05-10", "May 4 - May 10", false, {
      spend: 100,
      clicks: 100,
      impressions: 1000,
      conversions: 0,
    }),
    bucket("2026-05-11", "2026-05-17", "May 11 - May 17", false, {
      spend: 200,
      clicks: 100,
      impressions: 1000,
      conversions: 0,
    }),
    bucket("2026-05-18", "2026-05-24", "May 18 - May 24", false, {
      spend: 300,
      clicks: 100,
      impressions: 1000,
      conversions: 0,
    }),
  ];

  it("ignores legacy compare=wow and renders absolute metric columns only", () => {
    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: ["cpc"],
      compare: "wow",
    });
    expect(html).toContain(">Week<");
    expect(html).toContain(">CPC<");
    expect(html).not.toMatch(/\u0394 vs prev/);
    expect(html).not.toMatch(/color:#(?:059669|dc2626)[^"]*">[+-]\d+\.0%/);





  });
});

describe("generateWeeklyMetricTableHtml - direction reversed (Clicks)", () => {
  // Non-CPA metrics do not get colour treatment in the canonical table.
  const rows: WeeklyBucketRow[] = [
    bucket("2026-04-27", "2026-05-03", "Apr 27 - May 3", false, {
      spend: 0,
      clicks: 100,
      impressions: 0,
      conversions: 0,
    }),
    bucket("2026-05-04", "2026-05-10", "May 4 - May 10", false, {
      spend: 0,
      clicks: 200,
      impressions: 0,
      conversions: 0,
    }),
    bucket("2026-05-11", "2026-05-17", "May 11 - May 17", false, {
      spend: 0,
      clicks: 100,
      impressions: 0,
      conversions: 0,
    }),
  ];

  it("does not add direction colouring for non-CPA metrics", () => {
    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: ["clicks"],
      compare: "wow",
    });
    expect(html).toContain(">Clicks<");
    expect(html).not.toMatch(/color:#(?:059669|dc2626)[^"]*">[+-]\d+\.0%/);


  });
});

describe("generateWeeklyMetricTableHtml - prev === 0 compatibility", () => {
  const rows: WeeklyBucketRow[] = [
    bucket("2026-04-27", "2026-05-03", "Apr 27 - May 3", false, {
      spend: 0,
      clicks: 0, // zero clicks last week
      impressions: 0,
      conversions: 0,
    }),
    bucket("2026-05-04", "2026-05-10", "May 4 - May 10", false, {
      spend: 0,
      clicks: 50,
      impressions: 0,
      conversions: 0,
    }),
  ];

  it("renders absolute values without delta dashes when compare=wow is passed", () => {
    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: ["clicks"],
      compare: "wow",
    });

    expect(html).toContain(">0</td>");
    expect(html).toContain(">50</td>");
    expect(html).not.toMatch(/\u0394 vs prev/);
    const colorMatches = html.match(/color:#(?:059669|dc2626)/g) ?? [];
    expect(colorMatches).toHaveLength(0);
  });
});

describe("generateWeeklyMetricTableHtml - anti-chrome assertions", () => {
  const rows: WeeklyBucketRow[] = [
    bucket("2026-05-11", "2026-05-17", "May 11 - May 17", false, {
      spend: 850,
      clicks: 500,
      impressions: 50_000,
      conversions: 10,
    }),
  ];

  it("no card chrome, no blue body text, Verdana on container, partial highlight only for partial rows", () => {
    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: ["spend", "clicks", "cpa"],
    });
    expect(html).toContain("font-family:Verdana,sans-serif");
    expect(html).toContain("color:#222");
    expect(html).toContain("<strong>Weekly Performance Trend</strong>");
    expect(html).not.toContain("border-radius");
    expect(html).not.toContain("background:#eff6ff");
    expect(html).not.toContain("background:#ecfdf5");
    expect(html).not.toContain("#2563eb");
    expect(html).not.toContain("#1e40af");
    // Full-week row → no highlight bg anywhere.
    expect(html).not.toContain("background:#f0fdf4");
  });
});

describe("generateWeeklyMetricTableHtml - multi-metric layout", () => {
  const rows: WeeklyBucketRow[] = [
    bucket("2026-05-04", "2026-05-10", "May 4 - May 10", false, {
      spend: 850,
      clicks: 500,
      impressions: 50_000,
      conversions: 10,
    }),
    bucket("2026-05-11", "2026-05-17", "May 11 - 13 (Mon-Wed)", true, {
      spend: 300,
      clicks: 200,
      impressions: 10_000,
      conversions: 3,
    }),
  ];

  it("renders three header columns + three body columns, partial highlight spans all", () => {
    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: ["spend", "cpa", "cpc"],
    });
    expect(html).toContain(">Spend<");
    expect(html).toContain(">CPA<");
    expect(html).toContain(">CPC<");
    // Partial-row highlight: 1 label + 3 metric value cells = 4 highlighted
    // cells.
    const matches = html.match(/background:#f0fdf4/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

describe("generateWeeklyTrendNoteHtml - legacy entry stays green via shim", () => {
  it("buildWeeklyTrendRows still produces the legacy row shape", () => {
    const rows = buildWeeklyTrendRows({
      perDay: [
        { date: "2026-05-11", spend: 700, conversions: 7 },
        { date: "2026-05-12", spend: 0, conversions: 0 },
      ],
      weeks: 1,
      endDate: "2026-05-17",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(700);
    expect(rows[0].conversions).toBe(7);
    expect(rows[0].cpa).toBe(100);
  });
});
