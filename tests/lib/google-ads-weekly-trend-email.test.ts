/**
 * Tests for the canonical Weekly Performance Trend renderer. Pure TS - no
 * Payload, no HTTP, no clock dependency. All cases pass `endDate` explicitly
 * so the suite is hermetic across timezones / CI clocks.
 */

import { describe, it, expect } from "vitest";
import {
  buildWeeklyTrendRows,
  generateWeeklyTrendNoteHtml,
  type WeeklyTrendRow,
} from "@/lib/google-ads-weekly-trend-email";

/** Helper: build a perDay series with a constant per-day amount. */
function perDayRange(
  startIso: string,
  endIso: string,
  spendPerDay: number,
  conversionsPerDay: number,
): Array<{ date: string; spend: number; conversions: number }> {
  const out: Array<{ date: string; spend: number; conversions: number }> = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    out.push({
      date: `${y}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`,
      spend: spendPerDay,
      conversions: conversionsPerDay,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

describe("buildWeeklyTrendRows", () => {
  it("produces 4 Monday-anchored weeks ending Thu 21 May 2026 with the latest row flagged partial and labelled 'May 18 - 21 (Mon-Thu)'", () => {
    // 4 weeks ending Thu 2026-05-21 (the screenshot bug was the LLM
    // producing 'May 19 to May 21' instead of 'May 18 - 21' with the
    // partial-week suffix):
    //   - 2026-04-27..2026-05-03 (Mon-Sun, full)
    //   - 2026-05-04..2026-05-10 (Mon-Sun, full)
    //   - 2026-05-11..2026-05-17 (Mon-Sun, full)
    //   - 2026-05-18..2026-05-21 (Mon-Thu, partial)  ← bug fix sentinel
    const rows = buildWeeklyTrendRows({
      perDay: perDayRange("2026-04-27", "2026-05-21", 10, 1),
      weeks: 4,
      endDate: "2026-05-21",
    });
    expect(rows).toHaveLength(4);
    expect(rows[0].weekStart).toBe("2026-04-27");
    expect(rows[0].weekEnd).toBe("2026-05-03");
    expect(rows[0].partial).toBe(false);
    expect(rows[3].weekStart).toBe("2026-05-18");
    expect(rows[3].weekEnd).toBe("2026-05-21");
    expect(rows[3].partial).toBe(true);
    expect(rows[3].label).toBe("May 18 - 21 (Mon-Thu)");
    // And confirm we didn't accidentally produce "May 19 to 21" - the
    // direct regression from the user's screenshot.
    expect(rows[3].label).not.toContain("May 19");
  });

  it("when endDate is a Sunday the latest row is a full Mon-Sun week with no suffix", () => {
    const rows = buildWeeklyTrendRows({
      perDay: perDayRange("2026-04-27", "2026-05-24", 5, 0),
      weeks: 4,
      endDate: "2026-05-24", // Sunday
    });
    const last = rows[rows.length - 1];
    expect(last.weekStart).toBe("2026-05-18");
    expect(last.weekEnd).toBe("2026-05-24");
    expect(last.partial).toBe(false);
    expect(last.label).toBe("May 18 - May 24");
    expect(last.label).not.toContain("(");
  });

  it("when endDate is a Monday the latest row is a single-day partial with '(Mon)' suffix", () => {
    const rows = buildWeeklyTrendRows({
      perDay: perDayRange("2026-04-27", "2026-05-18", 1, 0),
      weeks: 4,
      endDate: "2026-05-18", // Monday
    });
    const last = rows[rows.length - 1];
    expect(last.weekStart).toBe("2026-05-18");
    expect(last.weekEnd).toBe("2026-05-18");
    expect(last.partial).toBe(true);
    expect(last.label).toBe("May 18 (Mon)");
  });

  it("buckets per-day rows correctly - only days inside the [weekStart, weekEnd] window count", () => {
    const rows = buildWeeklyTrendRows({
      perDay: [
        // First full week: 7 days x ($100, 1 conv) = $700, 7 conv → CPA $100
        ...perDayRange("2026-05-11", "2026-05-17", 100, 1),
        // Partial week (Mon-Wed): 3 days x ($200, 5 conv) = $600, 15 conv → CPA $40
        ...perDayRange("2026-05-18", "2026-05-20", 200, 5),
      ],
      weeks: 2,
      endDate: "2026-05-20", // Wed
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].spend).toBe(700);
    expect(rows[0].conversions).toBe(7);
    expect(rows[0].cpa).toBe(100);
    expect(rows[1].spend).toBe(600);
    expect(rows[1].conversions).toBe(15);
    expect(rows[1].cpa).toBe(40);
    expect(rows[1].partial).toBe(true);
  });

  it("returns cpa: null when conversions === 0", () => {
    const rows = buildWeeklyTrendRows({
      perDay: perDayRange("2026-05-11", "2026-05-17", 50, 0),
      weeks: 1,
      endDate: "2026-05-17",
    });
    expect(rows[0].conversions).toBe(0);
    expect(rows[0].cpa).toBeNull();
  });

  it("clamps weeks to [1, 12]", () => {
    const rowsHigh = buildWeeklyTrendRows({
      perDay: [],
      weeks: 99,
      endDate: "2026-05-24",
    });
    expect(rowsHigh).toHaveLength(12);

    const rowsLow = buildWeeklyTrendRows({
      perDay: [],
      weeks: 0,
      endDate: "2026-05-24",
    });
    expect(rowsLow).toHaveLength(1);
  });
});

describe("generateWeeklyTrendNoteHtml", () => {
  // Stable May 18-21 fixture: light spend in earlier weeks (green CPA),
  // partial latest week that lands on amber and red regions across rows.
  const fixtureRows: WeeklyTrendRow[] = [
    { weekStart: "2026-04-27", weekEnd: "2026-05-03", label: "Apr 27 - May 3", partial: false, spend: 850, conversions: 10, cpa: 85 },
    { weekStart: "2026-05-04", weekEnd: "2026-05-10", label: "May 4 - May 10", partial: false, spend: 1500, conversions: 10, cpa: 150 },
    { weekStart: "2026-05-11", weekEnd: "2026-05-17", label: "May 11 - May 17", partial: false, spend: 2410, conversions: 5, cpa: 482 },
    { weekStart: "2026-05-18", weekEnd: "2026-05-21", label: "May 18 - 21 (Mon-Wed)", partial: true, spend: 600, conversions: 4, cpa: 150 },
  ];

  it("sets Verdana on the container and #222 on cells, with the bold 'Weekly Performance Trend' heading", () => {
    const html = generateWeeklyTrendNoteHtml({ rows: fixtureRows });
    // Container declares Verdana exactly once at the outer div level - and
    // a few times inline on cells / heading so Gmail's quote/copy doesn't
    // drop it. Just assert it's present and the heading is bold.
    expect(html).toContain("font-family:Verdana,sans-serif");
    expect(html).toContain("color:#222");
    expect(html).toContain("<strong>Weekly Performance Trend</strong>");
    // No card chrome - never these styles anywhere.
    expect(html).not.toContain("border-radius");
    expect(html).not.toContain("background:#eff6ff");
    expect(html).not.toContain("background:#ecfdf5");
    // No blue body text (link / accent colours used by the old prompt-built HTML).
    expect(html).not.toContain("#2563eb");
    expect(html).not.toContain("#1e40af");
  });

  it("renders the May 18-21 fixture with green $85 CPA, red $482 CPA, and partial-row highlight only on the latest row", () => {
    const html = generateWeeklyTrendNoteHtml({ rows: fixtureRows });
    // Green CPA cell for the $85 row.
    expect(html).toMatch(/color:#059669[^"]*">\s*\$85/);
    // Red CPA cell for the $482 row.
    expect(html).toMatch(/color:#dc2626[^"]*">\s*\$482/);
    // Highlight light-green appears on the partial row only.
    const matches = html.match(/background:#f0fdf4/g) ?? [];
    // 4 cells in the partial row each carry the highlight bg.
    expect(matches.length).toBe(4);
    // Partial label is present, full-week labels too.
    expect(html).toContain("May 18 - 21 (Mon-Wed)");
    expect(html).toContain("May 11 - May 17");
  });

  it("does NOT render any highlight background when the latest row is a full week", () => {
    const fullWeekRows: WeeklyTrendRow[] = fixtureRows.map((r, i) =>
      i === fixtureRows.length - 1
        ? { ...r, partial: false, label: "May 18 - May 24", weekEnd: "2026-05-24" }
        : r,
    );
    const html = generateWeeklyTrendNoteHtml({ rows: fullWeekRows });
    expect(html).not.toContain("background:#f0fdf4");
  });

  it("renders a Verdana #222 summary paragraph below the table when `summary` is provided, omits it otherwise", () => {
    const withSummary = generateWeeklyTrendNoteHtml({
      rows: fixtureRows,
      summary: "CPA improved week on week despite spend climbing.",
    });
    expect(withSummary).toMatch(
      /<p style="[^"]*font-family:Verdana,sans-serif[^"]*color:#222[^"]*">CPA improved week on week despite spend climbing\.<\/p>/,
    );

    const withoutSummary = generateWeeklyTrendNoteHtml({ rows: fixtureRows });
    // Only the heading <p> exists - no second <p> tag.
    const pCount = (withoutSummary.match(/<p /g) ?? []).length;
    expect(pCount).toBe(1);
  });

  it("renders a dash and no colour when CPA is null (zero conversions)", () => {
    const rows: WeeklyTrendRow[] = [
      { weekStart: "2026-05-11", weekEnd: "2026-05-17", label: "May 11 - May 17", partial: false, spend: 200, conversions: 0, cpa: null },
    ];
    const html = generateWeeklyTrendNoteHtml({ rows });
    // Dash present in a CPA cell.
    expect(html).toMatch(/<td[^>]*text-align:right">-<\/td>/);
    // None of the threshold colours are applied to that row.
    expect(html).not.toContain("#059669");
    expect(html).not.toContain("#d97706");
    expect(html).not.toContain("#dc2626");
  });
});

describe("CPA threshold colours", () => {
  // The threshold helper is private - exercise it through the renderer.
  function colourFor(cpa: number): string | null {
    const html = generateWeeklyTrendNoteHtml({
      rows: [
        {
          weekStart: "2026-05-11",
          weekEnd: "2026-05-17",
          label: "May 11 - May 17",
          partial: false,
          spend: cpa,
          conversions: 1,
          cpa,
        },
      ],
    });
    for (const hex of ["#059669", "#d97706", "#dc2626"]) {
      if (html.includes(`color:${hex}`)) return hex;
    }
    return null;
  }

  it("CPA < $100 → green #059669", () => {
    expect(colourFor(99)).toBe("#059669");
    expect(colourFor(50)).toBe("#059669");
  });

  it("$100 and $300 inclusive bounds → amber #d97706", () => {
    expect(colourFor(100)).toBe("#d97706");
    expect(colourFor(200)).toBe("#d97706");
    expect(colourFor(300)).toBe("#d97706");
  });

  it("CPA > $300 → red #dc2626", () => {
    expect(colourFor(301)).toBe("#dc2626");
    expect(colourFor(1000)).toBe("#dc2626");
  });
});
