import { describe, expect, it } from "vitest";

import { computeSpendPaceStatus } from "@/lib/goal-agents/spend-pacer";
import { netMonthlyRetainer, oneOffsYTD, retainerRevenueYTD } from "@/lib/client-revenue";

describe("critical agency business logic", () => {
  describe("agent spend pacing guardrails", () => {
    it("blocks spend reductions when an account is underspending", () => {
      const status = computeSpendPaceStatus({
        monthlyBudgetMicros: 3_000_000_000,
        pacingMode: "standard",
        mtdSpendMicros: 900_000_000,
        currentDayOfMonth: 15,
        daysInMonth: 30,
      });

      expect(status.state).toBe("underspending");
      expect(status.pacePercent).toBe(60);
      expect(status.canReduceSpend).toBe(false);
      expect(status.canIncreaseSpend).toBe(true);
      expect(status.alertMessage).toContain("underspending");
    });

    it("blocks spend increases when an account is overspending", () => {
      const status = computeSpendPaceStatus({
        monthlyBudgetMicros: 3_000_000_000,
        pacingMode: "standard",
        mtdSpendMicros: 2_400_000_000,
        currentDayOfMonth: 15,
        daysInMonth: 30,
      });

      expect(status.state).toBe("overspending");
      expect(status.pacePercent).toBe(160);
      expect(status.canReduceSpend).toBe(true);
      expect(status.canIncreaseSpend).toBe(false);
      expect(status.alertMessage).toContain("overspending");
    });

    it("keeps performance-cap clients from increasing spend even when pace is healthy", () => {
      const status = computeSpendPaceStatus({
        monthlyBudgetMicros: 3_000_000_000,
        pacingMode: "performance_cap",
        mtdSpendMicros: 1_500_000_000,
        currentDayOfMonth: 15,
        daysInMonth: 30,
      });

      expect(status.state).toBe("on_track");
      expect(status.canReduceSpend).toBe(true);
      expect(status.canIncreaseSpend).toBe(false);
    });
  });

  describe("agency revenue calculations", () => {
    it("subtracts active referral commissions from monthly retainer net revenue", () => {
      const net = netMonthlyRetainer(
        2_000,
        [
          {
            frequency: "monthly",
            commissionType: "percentage",
            percentage: 10,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
          },
          {
            frequency: "monthly",
            commissionType: "fixed",
            monthlyAmount: 50,
            startDate: "2025-01-01",
            endDate: "2025-12-31",
          },
        ],
        new Date("2026-05-15T00:00:00.000Z"),
      );

      expect(net).toBe(1_800);
    });

    it("calculates retainer revenue YTD including first-month proration and retainer changes", () => {
      const total = retainerRevenueYTD(
        {
          monthlyRetainer: 2_000,
          clientStartDate: "2026-01-16",
          retainerHistory: [
            { previousAmount: 1_000, amount: 2_000, effectiveDate: "2026-04-01" },
          ],
          referralCommissions: [],
        },
        new Date("2026-05-20T00:00:00.000Z"),
      );

      expect(total).toBeCloseTo(6_516.13, 2);
    });

    it("includes only one-off projects completed in the requested year", () => {
      const total = oneOffsYTD(
        [
          { projectName: "Audit", amount: 750, date: "2026-02-10" },
          { projectName: "Landing page", amount: 1_250, date: "2026-05-01" },
          { projectName: "Old build", amount: 5_000, date: "2025-12-20" },
          { projectName: "Future build", amount: 9_000, date: "2026-12-20" },
        ],
        new Date("2026-05-20T00:00:00.000Z"),
      );

      expect(total).toBe(2_000);
    });
  });
});
