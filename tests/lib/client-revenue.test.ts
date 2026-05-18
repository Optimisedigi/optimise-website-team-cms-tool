import {
  monthlyCommissionForDate,
  netMonthlyRetainer,
  retainerRevenueYTD,
  oneOffsYTD,
  oneOffsThisMonth,
  monthsBetween,
  firstMonthProrationFactor,
  splitOneOffs,
  type ReferralCommission,
} from "@/lib/client-revenue";

describe("monthsBetween", () => {
  it("counts whole months between two dates", () => {
    expect(monthsBetween(new Date(2026, 0, 1), new Date(2026, 5, 1))).toBe(5);
  });
  it("clamps at 0 when end is before start", () => {
    expect(monthsBetween(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe(0);
  });
});

describe("monthlyCommissionForDate", () => {
  const monthlyRetainer = 1000;
  const date = new Date(2026, 4, 15); // 15 May 2026

  it("returns 0 when no commissions", () => {
    expect(monthlyCommissionForDate([], monthlyRetainer, date)).toBe(0);
    expect(monthlyCommissionForDate(null, monthlyRetainer, date)).toBe(0);
  });

  it("ignores one_off commissions", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "one_off",
        oneOffAmount: 500,
        startDate: "2026-01-01",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(0);
  });

  it("computes percentage of gross retainer", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "percentage",
        percentage: 8,
        startDate: "2026-01-01",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(80);
  });

  it("uses fixed monthly amount when commissionType=fixed", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "fixed",
        monthlyAmount: 120,
        startDate: "2026-01-01",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(120);
  });

  it("excludes commissions starting in the future", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "percentage",
        percentage: 10,
        startDate: "2026-08-01",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(0);
  });

  it("excludes commissions whose endDate has passed", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "percentage",
        percentage: 10,
        startDate: "2025-01-01",
        endDate: "2026-03-31",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(0);
  });

  it("includes commissions whose endDate is in the future", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "percentage",
        percentage: 10,
        startDate: "2025-01-01",
        endDate: "2026-12-31",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(100);
  });

  it("treats missing percentage as 0 with no error", () => {
    const commissions: ReferralCommission[] = [
      {
        frequency: "monthly",
        commissionType: "percentage",
        startDate: "2025-01-01",
      },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(0);
  });

  it("sums multiple active commissions", () => {
    const commissions: ReferralCommission[] = [
      { frequency: "monthly", commissionType: "percentage", percentage: 8, startDate: "2026-01-01" },
      { frequency: "monthly", commissionType: "fixed", monthlyAmount: 50, startDate: "2026-01-01" },
    ];
    expect(monthlyCommissionForDate(commissions, monthlyRetainer, date)).toBe(130);
  });
});

describe("netMonthlyRetainer", () => {
  const date = new Date(2026, 4, 15);

  it("subtracts commission from retainer", () => {
    const commissions: ReferralCommission[] = [
      { frequency: "monthly", commissionType: "percentage", percentage: 8, startDate: "2026-01-01" },
    ];
    expect(netMonthlyRetainer(1350, commissions, date)).toBe(1242);
  });

  it("clamps at 0 when commission exceeds retainer", () => {
    const commissions: ReferralCommission[] = [
      { frequency: "monthly", commissionType: "fixed", monthlyAmount: 2000, startDate: "2026-01-01" },
    ];
    expect(netMonthlyRetainer(1000, commissions, date)).toBe(0);
  });

  it("returns gross when no commissions", () => {
    expect(netMonthlyRetainer(1000, [], date)).toBe(1000);
  });
});

describe("retainerRevenueYTD", () => {
  const now = new Date(2026, 4, 15); // 15 May 2026 — 5 full months (Jan-May)

  it("returns 0 when no retainer", () => {
    expect(
      retainerRevenueYTD({ monthlyRetainer: 0, clientStartDate: "2026-01-01" }, now),
    ).toBe(0);
  });

  it("falls back to current-month net when no clientStartDate", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1000,
          referralCommissions: [
            { frequency: "monthly", commissionType: "percentage", percentage: 10, startDate: "2026-01-01" },
          ],
        },
        now,
      ),
    ).toBe(900);
  });

  it("multiplies net retainer by months elapsed when no history", () => {
    // Jan, Feb, Mar, Apr, May = 5 months, each $1242 net
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1350,
          clientStartDate: "2025-06-01",
          referralCommissions: [
            { frequency: "monthly", commissionType: "percentage", percentage: 8, startDate: "2025-06-01" },
          ],
        },
        now,
      ),
    ).toBe(1242 * 5);
  });

  it("applies a retainer change mid-year with a percentage commission", () => {
    // Client started 2025-06-01 at $1000; on 2026-04-01 changed to $1500.
    // Commission: 10% of gross, active all year.
    // Jan, Feb, Mar 2026 = 3 × ($1000 − $100) = 2700
    // Apr, May 2026 = 2 × ($1500 − $150) = 2700
    // Total = 5400
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1500,
          clientStartDate: "2025-06-01",
          retainerHistory: [
            {
              amount: 1500,
              previousAmount: 1000,
              effectiveDate: "2026-04-01T00:00:00.000Z",
            },
          ],
          referralCommissions: [
            { frequency: "monthly", commissionType: "percentage", percentage: 10, startDate: "2025-06-01" },
          ],
        },
        now,
      ),
    ).toBe(5400);
  });

  it("only counts months from clientStartDate forward when started this year", () => {
    // Started 1 Mar 2026 → Mar, Apr, May = 3 months × 1000 = 3000
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1000,
          clientStartDate: "2026-03-01",
        },
        now,
      ),
    ).toBe(3000);
  });

  it("returns 0 when clientStartDate is in the future", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1000,
          clientStartDate: "2026-12-01",
        },
        now,
      ),
    ).toBe(0);
  });

  it("ignores one_off commissions in retainer math", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1000,
          clientStartDate: "2025-06-01",
          referralCommissions: [
            { frequency: "one_off", oneOffAmount: 500, startDate: "2026-02-01" },
          ],
        },
        now,
      ),
    ).toBe(5000);
  });

  it("clamps net to 0 when commission exceeds retainer", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1000,
          clientStartDate: "2025-06-01",
          referralCommissions: [
            { frequency: "monthly", commissionType: "fixed", monthlyAmount: 2000, startDate: "2025-06-01" },
          ],
        },
        now,
      ),
    ).toBe(0);
  });
});

describe("oneOffsYTD", () => {
  const now = new Date(2026, 4, 15);

  it("sums projects in current calendar year up to now", () => {
    const projects = [
      { amount: 500, date: "2026-01-15" },
      { amount: 700, date: "2026-04-20" },
      { amount: 100, date: "2025-12-31" }, // prior year — excluded
    ];
    expect(oneOffsYTD(projects, now)).toBe(1200);
  });

  it("returns 0 for empty input", () => {
    expect(oneOffsYTD([], now)).toBe(0);
    expect(oneOffsYTD(null, now)).toBe(0);
  });

  it("excludes future-dated projects within the current month", () => {
    const projects = [
      { amount: 500, date: "2026-05-31" }, // future this month — excluded
      { amount: 200, date: "2026-05-10" }, // past — included
    ];
    expect(oneOffsYTD(projects, now)).toBe(200);
  });

  it("filters by countTowardsRetainer when filter arg supplied", () => {
    const projects = [
      { amount: 500, date: "2026-02-01", countTowardsRetainer: true },
      { amount: 700, date: "2026-03-01", countTowardsRetainer: false },
      { amount: 300, date: "2026-04-01" },
    ];
    expect(oneOffsYTD(projects, now, true)).toBe(500);
    expect(oneOffsYTD(projects, now, false)).toBe(1000); // 700 + 300 (unset treated as off)
  });
});

describe("oneOffsThisMonth", () => {
  const now = new Date(2026, 4, 15);

  it("sums only current-month projects", () => {
    const projects = [
      { amount: 500, date: "2026-04-30" },
      { amount: 700, date: "2026-05-10" },
      { amount: 100, date: "2026-05-31" }, // future this month — excluded
    ];
    expect(oneOffsThisMonth(projects, now)).toBe(700);
  });
});

describe("firstMonthProrationFactor", () => {
  it("returns 1 when start day is the 1st", () => {
    const start = new Date(2026, 2, 1); // 1 Mar 2026
    expect(firstMonthProrationFactor(start, new Date(2026, 2, 15))).toBe(1);
  });

  it("returns 1/daysInMonth when start day is the last of the month", () => {
    const start = new Date(2026, 2, 31); // 31 Mar 2026 (31 days)
    expect(firstMonthProrationFactor(start, new Date(2026, 2, 31))).toBeCloseTo(1 / 31);
  });

  it("returns 1 for any later month", () => {
    const start = new Date(2026, 2, 13);
    expect(firstMonthProrationFactor(start, new Date(2026, 3, 1))).toBe(1);
    expect(firstMonthProrationFactor(start, new Date(2027, 0, 1))).toBe(1);
  });

  it("returns 0 for any earlier month", () => {
    const start = new Date(2026, 2, 13);
    expect(firstMonthProrationFactor(start, new Date(2026, 1, 28))).toBe(0);
    expect(firstMonthProrationFactor(start, new Date(2025, 11, 1))).toBe(0);
  });

  it("Berendsen case: start 13 Mar → 19/31", () => {
    const start = new Date(2026, 2, 13);
    expect(firstMonthProrationFactor(start, new Date(2026, 2, 15))).toBeCloseTo(19 / 31, 10);
  });
});

describe("splitOneOffs", () => {
  it("returns empty groups for empty input", () => {
    expect(splitOneOffs([])).toEqual({ retainer: [], oneOff: [] });
    expect(splitOneOffs(null)).toEqual({ retainer: [], oneOff: [] });
  });

  it("partitions rows by countTowardsRetainer flag", () => {
    const a = { projectName: "a", amount: 1, date: "2026-01-01", countTowardsRetainer: true };
    const b = { projectName: "b", amount: 2, date: "2026-01-02", countTowardsRetainer: false };
    const c = { projectName: "c", amount: 3, date: "2026-01-03" };
    const result = splitOneOffs([a, b, c]);
    expect(result.retainer).toEqual([a]);
    expect(result.oneOff).toEqual([b, c]);
  });
});

describe("retainerRevenueYTD with pro-ration, setupFee, and tagged one-offs", () => {
  const now = new Date(2026, 4, 18); // 18 May 2026

  it("pro-rates the first month based on clientStartDate (Berendsen case)", () => {
    // Start 13 Mar 2026, $1350/mo, today 18 May 2026
    // Mar = 1350 × 19/31, Apr = 1350, May = 1350 → sum
    const expected = 1350 * (19 / 31) + 1350 + 1350;
    expect(
      retainerRevenueYTD(
        { monthlyRetainer: 1350, clientStartDate: "2026-03-13" },
        now,
      ),
    ).toBeCloseTo(expected, 6);
  });

  it("applies pro-ration to monthly commission in the start month", () => {
    // Start 13 Mar 2026, $1350/mo, 8% commission
    // Mar = (1350 − 108) × 19/31, Apr = 1242, May = 1242
    const expected = 1242 * (19 / 31) + 1242 + 1242;
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 1350,
          clientStartDate: "2026-03-13",
          referralCommissions: [
            { frequency: "monthly", commissionType: "percentage", percentage: 8, startDate: "2026-03-13" },
          ],
        },
        now,
      ),
    ).toBeCloseTo(expected, 6);
  });

  it("adds setupFee to YTD when clientStartDate is in current year", () => {
    // No retainer, just a setup fee in YTD
    expect(
      retainerRevenueYTD(
        { monthlyRetainer: 0, setupFee: 1000, clientStartDate: "2026-03-13" },
        now,
      ),
    ).toBe(1000);
  });

  it("excludes setupFee when clientStartDate is in a prior year", () => {
    // Started in 2025 — setup fee belongs to 2025 YTD, not 2026
    expect(
      retainerRevenueYTD(
        { monthlyRetainer: 0, setupFee: 1000, clientStartDate: "2025-06-01" },
        now,
      ),
    ).toBe(0);
  });

  it("includes retainer-tagged one-offs in retainerYTD", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 0,
          clientStartDate: "2025-06-01",
          oneOffProjects: [
            { amount: 500, date: "2026-02-01", countTowardsRetainer: true },
            { amount: 200, date: "2026-03-01", countTowardsRetainer: false },
          ],
        },
        now,
      ),
    ).toBe(500);
  });

  it("excludes one-offs without the flag from retainerYTD", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 0,
          clientStartDate: "2025-06-01",
          oneOffProjects: [
            { amount: 200, date: "2026-03-01", countTowardsRetainer: false },
            { amount: 300, date: "2026-04-01" },
          ],
        },
        now,
      ),
    ).toBe(0);
  });

  it("excludes future-dated retainer-tagged one-offs from YTD", () => {
    expect(
      retainerRevenueYTD(
        {
          monthlyRetainer: 0,
          clientStartDate: "2025-06-01",
          oneOffProjects: [
            { amount: 800, date: "2026-12-01", countTowardsRetainer: true },
          ],
        },
        now,
      ),
    ).toBe(0);
  });
});
