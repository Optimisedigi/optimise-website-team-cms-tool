import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 },
      );
    }

    // Fetch client to confirm it exists and get GSC status
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      select: { name: true, slug: true, gscConnected: true } as any,
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const clientMeta = {
      clientId: client.id,
      gscConnected: (client as any).gscConnected || false,
    };

    // Query last 13 months of snapshots
    const snapshots = await payload.find({
      collection: "gsc-snapshots",
      where: { client: { equals: client.id } },
      sort: "-snapshotDate",
      limit: 100,
      overrideAccess: true,
    });

    // Group by the month the data covers (periodEnd), not when snapshot was taken
    // Use slice(0,7) to extract "YYYY-MM" — handles both "YYYY-MM-DD" and full ISO strings
    const byMonth = new Map<string, any>();
    for (const snap of snapshots.docs) {
      const dateStr = (snap.periodEnd as string) || (snap.snapshotDate as string);
      const key = dateStr.slice(0, 7); // "YYYY-MM"
      if (!byMonth.has(key)) byMonth.set(key, snap);
    }

    // Build gscMonthly array: every month from Jan 2026 to current month (zeros for missing)
    const now = new Date();
    const gscMonthly: { month: string; clicks: number; impressions: number }[] = [];
    const chartStart = new Date(2026, 0, 1); // Jan 2026
    const chartEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(chartStart); d <= chartEnd; d.setMonth(d.getMonth() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const snap = byMonth.get(key);
      gscMonthly.push({
        month: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
        clicks: snap ? ((snap.totalClicks as number) || 0) : 0,
        impressions: snap ? ((snap.totalImpressions as number) || 0) : 0,
      });
    }

    const latestSnap = snapshots.docs[0];
    if (!latestSnap) {
      return NextResponse.json({ gsc: clientMeta, gscMonthly });
    }

    // Compute unique keywords and pages with clicks > 0
    const topKeywords = (latestSnap.topKeywords as any[]) || [];
    const topPages = (latestSnap.topPages as any[]) || [];
    const uniqueKeywords = topKeywords.filter((k: any) => k.clicks > 0).length;
    const uniquePages = topPages.filter((p: any) => p.clicks > 0).length;

    // Compute YoY changes
    const latestDateStr = (latestSnap.snapshotDate as string);
    const [latestYear, latestMonth] = latestDateStr.split('-');
    const yoyKey = `${Number(latestYear) - 1}-${latestMonth}`;
    const yoySnap = byMonth.get(yoyKey);

    let clicksChange = latestSnap.clicksChange as number | undefined;
    let impressionsChange = latestSnap.impressionsChange as number | undefined;
    let positionChange = latestSnap.positionChange as number | undefined;
    let ctrChange: number | undefined;

    if (yoySnap) {
      const oldClicks = (yoySnap.totalClicks as number) || 1;
      const oldImpressions = (yoySnap.totalImpressions as number) || 1;
      const oldCtr = (yoySnap.avgCtr as number) || 0;
      const oldPosition = (yoySnap.avgPosition as number) || 0;
      clicksChange = round(((((latestSnap.totalClicks as number) || 0) - oldClicks) / oldClicks) * 100);
      impressionsChange = round(((((latestSnap.totalImpressions as number) || 0) - oldImpressions) / oldImpressions) * 100);
      ctrChange = oldCtr > 0 ? round(((((latestSnap.avgCtr as number) || 0) - oldCtr) / oldCtr) * 100) : 0;
      positionChange = oldPosition > 0 ? round(((((latestSnap.avgPosition as number) || 0) - oldPosition) / oldPosition) * 100) : 0;
    }

    const gsc = {
      ...latestSnap,
      ...clientMeta,
      uniqueKeywords,
      uniquePages,
      clicksChange,
      impressionsChange,
      positionChange,
      ctrChange,
    };

    return NextResponse.json({ gsc, gscMonthly });
  } catch (err) {
    console.error("[gsc/snapshot] error:", err);
    return NextResponse.json(
      { error: "Failed to load GSC snapshot" },
      { status: 500 },
    );
  }
}
