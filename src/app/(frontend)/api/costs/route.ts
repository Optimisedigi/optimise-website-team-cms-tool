import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const queryMonth = url.searchParams.get("month"); // YYYY-MM or null for current

    const now = new Date();
    const currentMonth = queryMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Build last 6 month keys (including current)
    const [cYear, cMonth] = currentMonth.split("-").map(Number);
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cYear, cMonth - 1 - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const previousMonthDate = new Date(cYear, cMonth - 2, 1);
    const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

    // Fetch all categories
    const categoriesResult = await payload.find({
      collection: "cost-categories",
      limit: 100,
      where: { isActive: { equals: true } },
      overrideAccess: true,
    });
    const categories = categoriesResult.docs;

    // Fetch current month costs
    const currentCosts = await payload.find({
      collection: "business-costs",
      where: { month: { equals: currentMonth } },
      limit: 1000,
      sort: "-date",
      depth: 1,
      overrideAccess: true,
    });

    // Fetch previous month costs (for spike detection)
    const prevCosts = await payload.find({
      collection: "business-costs",
      where: { month: { equals: previousMonth } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    });

    // Fetch last 6 months costs (for history chart)
    const historyCosts = await payload.find({
      collection: "business-costs",
      where: { month: { in: monthKeys } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    });

    // Fetch uncategorised
    const uncategorisedResult = await payload.find({
      collection: "business-costs",
      where: {
        or: [
          { category: { exists: false } },
          { category: { equals: null as any } },
        ],
      },
      limit: 100,
      sort: "-date",
      depth: 0,
      overrideAccess: true,
    });

    // --- Build costsByCategory ---
    const costsByCategory: Array<{
      category: any;
      total: number;
      count: number;
      items: any[];
    }> = [];

    const categoryMap = new Map<string, { total: number; count: number; items: any[] }>();
    for (const cat of categories) {
      categoryMap.set(String(cat.id), { total: 0, count: 0, items: [] });
    }
    let uncatTotal = 0;
    const uncatItems: any[] = [];

    for (const cost of currentCosts.docs) {
      const catId = typeof cost.category === "object" && cost.category
        ? String((cost.category as any).id)
        : cost.category ? String(cost.category) : null;

      if (catId && categoryMap.has(catId)) {
        const entry = categoryMap.get(catId)!;
        entry.total += (cost.amount as number) || 0;
        entry.count++;
        entry.items.push(cost);
      } else {
        uncatTotal += (cost.amount as number) || 0;
        uncatItems.push(cost);
      }
    }

    for (const cat of categories) {
      const entry = categoryMap.get(String(cat.id));
      if (entry) {
        costsByCategory.push({
          category: cat,
          total: round(entry.total),
          count: entry.count,
          items: entry.items,
        });
      }
    }
    if (uncatItems.length > 0) {
      costsByCategory.push({
        category: { id: null, name: "Uncategorised", color: "#9CA3AF" },
        total: round(uncatTotal),
        count: uncatItems.length,
        items: uncatItems,
      });
    }

    // --- Build costHistory (stacked bar data) ---
    const costHistory = monthKeys.map((mk) => {
      const monthCosts = historyCosts.docs.filter((c: any) => c.month === mk);
      const byCategory: Record<string, number> = {};
      for (const cat of categories) {
        byCategory[String(cat.id)] = 0;
      }
      let uncatSum = 0;
      for (const cost of monthCosts) {
        const catId = cost.category ? String(cost.category) : null;
        if (catId && byCategory[catId] !== undefined) {
          byCategory[catId] += (cost.amount as number) || 0;
        } else {
          uncatSum += (cost.amount as number) || 0;
        }
      }
      const d = new Date(mk + "-01");
      return {
        label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
        month: mk,
        categories: categories.map((cat) => ({
          id: cat.id,
          name: (cat as any).name,
          color: (cat as any).color,
          total: round(byCategory[String(cat.id)] || 0),
        })),
        uncategorised: round(uncatSum),
        total: round(monthCosts.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0)),
      };
    });

    // --- Build costAlerts (waste detection) ---
    const costAlerts: Array<{ type: string; severity: string; message: string; categoryId?: string; categoryName?: string }> = [];

    // Previous month totals by category
    const prevByCategory = new Map<string, number>();
    for (const cost of prevCosts.docs) {
      const catId = cost.category ? String(cost.category) : "uncategorised";
      prevByCategory.set(catId, (prevByCategory.get(catId) || 0) + ((cost.amount as number) || 0));
    }

    for (const cat of categories) {
      const catIdStr = String(cat.id);
      const currentTotal = categoryMap.get(catIdStr)?.total || 0;
      const budget = (cat as any).budget as number | undefined;
      const prevTotal = prevByCategory.get(catIdStr) || 0;

      // Over-budget alert
      if (budget && budget > 0 && currentTotal > budget) {
        costAlerts.push({
          type: "over_budget",
          severity: "red",
          message: `${(cat as any).name} is $${round(currentTotal - budget)} over budget ($${round(currentTotal)} / $${budget})`,
          categoryId: catIdStr,
          categoryName: (cat as any).name,
        });
      }

      // Spike detection: >20% increase month-over-month
      if (prevTotal > 0 && currentTotal > 0) {
        const increase = ((currentTotal - prevTotal) / prevTotal) * 100;
        if (increase > 20) {
          costAlerts.push({
            type: "spike",
            severity: "orange",
            message: `${(cat as any).name} up ${round(increase)}% vs last month ($${round(currentTotal)} vs $${round(prevTotal)})`,
            categoryId: catIdStr,
            categoryName: (cat as any).name,
          });
        }
      }
    }

    // Uncategorised alert
    if (uncategorisedResult.totalDocs > 0) {
      costAlerts.push({
        type: "uncategorised",
        severity: "blue",
        message: `${uncategorisedResult.totalDocs} transaction${uncategorisedResult.totalDocs > 1 ? "s" : ""} need categorisation`,
      });
    }

    const totalThisMonth = round(currentCosts.docs.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0));
    const totalLastMonth = round(prevCosts.docs.reduce((sum: number, c: any) => sum + ((c.amount as number) || 0), 0));

    return NextResponse.json({
      costsByCategory,
      costHistory,
      costAlerts,
      uncategorised: uncategorisedResult.docs,
      totalThisMonth,
      totalLastMonth,
      currentMonth,
      categories,
    });
  } catch (err) {
    console.error("[costs] error:", err);
    return NextResponse.json(
      { error: "Failed to load cost data", details: String(err) },
      { status: 500 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
