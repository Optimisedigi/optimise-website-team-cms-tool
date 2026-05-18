/**
 * Diagnostic endpoint — returns the per-client breakdown that feeds the
 * dashboard topline (Monthly Retainer net, Retainer Revenue YTD, One-Off
 * Projects YTD, ytdRevenue used by Yearly Sales Target).
 *
 * Protected by `x-api-key: $AUDIT_API_KEY`. Read-only.
 *
 * Intended as a temporary tool to validate dashboard numbers against the
 * underlying client records. Safe to leave in place but can be removed
 * once verification is complete.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import crypto from "crypto";
import {
  historicalRevenueTotal,
  monthlyCommissionForDate,
  netMonthlyRetainer,
  oneOffsThisMonth,
  oneOffsYTD,
  retainerRevenueYTD,
  revenueShareFactor,
} from "@/lib/client-revenue";

function checkApiKey(request: NextRequest): NextResponse | null {
  const expected = Buffer.from(process.env.AUDIT_API_KEY ?? "");
  const got = Buffer.from(request.headers.get("x-api-key") ?? "");
  if (
    expected.length === 0 ||
    got.length !== expected.length ||
    !crypto.timingSafeEqual(got, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = checkApiKey(request);
  if (unauthorized) return unauthorized;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const now = new Date();

  const clients = await payload.find({
    collection: "clients",
    where: {
      isActive: { equals: true },
      or: [
        { isAgency: { not_equals: true } },
        { isAgency: { exists: false } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  let monthlyRetainerNet = 0;
  let retainerYTD = 0;
  let oneOffYTD = 0;
  let oneOffThisMonth = 0;
  let historicalTotal = 0;

  const breakdown = clients.docs.map((c: any) => {
    const mr = Number(c.monthlyRetainer) || 0;
    const commissions = Array.isArray(c.referralCommissions) ? c.referralCommissions : [];
    const oneOffs = Array.isArray(c.oneOffProjects) ? c.oneOffProjects : [];
    const history = Array.isArray(c.retainerHistory) ? c.retainerHistory : [];
    const sharePct = Number(c.revenueSharePercent ?? 100);
    const share = revenueShareFactor(sharePct);

    const commissionNow = monthlyCommissionForDate(commissions, mr, now);
    const net = netMonthlyRetainer(mr, commissions, now);
    const r_ytd = retainerRevenueYTD(
      {
        monthlyRetainer: mr,
        clientStartDate: c.clientStartDate ?? null,
        retainerHistory: history,
        referralCommissions: commissions,
      },
      now,
    );
    const oo_ytd = oneOffsYTD(oneOffs, now);
    const oo_month = oneOffsThisMonth(oneOffs, now);
    const hist = historicalRevenueTotal(c.historicalRevenueByYear);

    // Apply per-client share to the agency-wide rollups; per-client fields
    // below stay gross so the diag shows both views.
    monthlyRetainerNet += net * share;
    retainerYTD += r_ytd * share;
    oneOffYTD += oo_ytd * share;
    oneOffThisMonth += oo_month * share;
    historicalTotal += hist * share;

    return {
      id: c.id,
      name: c.name,
      clientStartDate: c.clientStartDate ?? null,
      revenueSharePercent: sharePct,
      monthlyRetainerGross: mr,
      activeMonthlyCommission: commissionNow,
      monthlyRetainerNet: net,
      monthlyRetainerNetAgency: net * share,
      historicalRevenue: hist,
      historicalRevenueAgency: hist * share,
      retainerYTD: r_ytd,
      retainerYTDAgency: r_ytd * share,
      oneOffsYTD: oo_ytd,
      oneOffsYTDAgency: oo_ytd * share,
      oneOffsThisMonth: oo_month,
      retainerHistory: history.map((h: any) => ({
        amount: h.amount,
        previousAmount: h.previousAmount,
        effectiveDate: h.effectiveDate,
      })),
      referralCommissions: commissions.map((cc: any) => ({
        payeeName: cc.payeeName,
        frequency: cc.frequency,
        commissionType: cc.commissionType,
        percentage: cc.percentage,
        monthlyAmount: cc.monthlyAmount,
        oneOffAmount: cc.oneOffAmount,
        startDate: cc.startDate,
        endDate: cc.endDate,
      })),
      oneOffProjects: oneOffs.map((p: any) => ({
        projectName: p.projectName,
        amount: p.amount,
        date: p.date,
      })),
    };
  });

  const ytdRevenue = retainerYTD + oneOffYTD + historicalTotal;

  return NextResponse.json({
    asOf: now.toISOString(),
    yearStart: new Date(now.getFullYear(), 0, 1).toISOString(),
    totals: {
      monthlyRetainerNet,
      retainerYTD,
      oneOffYTD,
      oneOffThisMonth,
      historicalTotal,
      ytdRevenue,
    },
    explanation: {
      ytdRevenue:
        "ytdRevenue = retainerYTD + oneOffYTD + historicalTotal. This is the number shown by the Yearly Sales Target progress bar.",
      retainerYTD:
        "For each active non-agency client: walk every calendar month from max(clientStartDate, Jan 1) through current month. For each month, look up the gross retainer in force (from retainerHistory), subtract active monthly commissions, and sum. If client has no clientStartDate, falls back to current-month net retainer only.",
      monthlyRetainerNet:
        "Sum of (monthlyRetainer - active monthly commissions) across all active non-agency clients, evaluated for the current month.",
      oneOffYTD:
        "Sum of oneOffProjects.amount across all active non-agency clients where the project date falls in the current calendar year up to the start of next month.",
    },
    clientCount: breakdown.length,
    clients: breakdown,
  });
}
