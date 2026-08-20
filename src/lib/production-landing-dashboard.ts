import { NextRequest, NextResponse } from "next/server";

const PRODUCTION_ORIGIN = "https://cms.optimisedigital.online";

type LandingDashboardPath =
  | "/api/dashboard/landing-experiments"
  | "/api/dashboard/landing-pages";

/**
 * Development reads landing analytics from production instead of a local copy.
 * The fixed origin and scoped cookie prevent this from becoming an open proxy.
 */
export async function proxyProductionLandingDashboard(
  req: NextRequest,
  path: LandingDashboardPath,
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "development") return null;

  const token = req.cookies.get("dashboard_token")?.value;
  if (!token) return null;

  const target = new URL(path, PRODUCTION_ORIGIN);
  target.search = req.nextUrl.search;

  try {
    const upstream = await fetch(target, {
      headers: { cookie: `dashboard_token=${encodeURIComponent(token)}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "x-dashboard-data-source": "production",
      },
    });
  } catch (error) {
    console.error("[landing-dashboard] production data unavailable:", error);
    return NextResponse.json(
      { error: "Production landing data is unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
