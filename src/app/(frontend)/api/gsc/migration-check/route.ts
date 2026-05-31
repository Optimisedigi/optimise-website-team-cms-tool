import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { refreshAccessToken } from "@/lib/gsc-service";
import { runMigrationCheck } from "@/lib/seo-migration-check";
import { parseBrandTerms } from "@/lib/brand-terms";

// Redirect tracing + GSC calls can take a while; allow more headroom.
export const maxDuration = 300;

/**
 * GET /api/gsc/migration-check?clientId=123
 * Lists prior migration reviews for a client (lightweight — no heavy JSON).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const reviews = await payload.find({
      collection: "seo-migration-checks",
      where: { client: { equals: Number(clientId) } },
      sort: "-createdAt",
      limit: 20,
      overrideAccess: true,
    });

    const items = reviews.docs.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      cutoverDate: r.cutoverDate,
      overallScore: r.overallScore,
      runAt: r.runAt,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ reviews: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list reviews";
    console.error("[gsc/migration-check]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/gsc/migration-check
 * Body: { clientId, cutoverDate (YYYY-MM-DD), isDomainMove? }
 *
 * Runs the post-migration SEO review for one client and persists the result.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let step = "parse-body";
  try {
    let body: { clientId?: string; cutoverDate?: string; isDomainMove?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { clientId, cutoverDate, isDomainMove } = body;
    if (!clientId || !cutoverDate) {
      return NextResponse.json(
        { error: "clientId and cutoverDate are required" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) {
      return NextResponse.json(
        { error: "cutoverDate must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    step = "auth";
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "load-client";
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const siteUrl = (client as { gscPropertyUrl?: string | null }).gscPropertyUrl;
    const refreshToken = (client as { gscRefreshToken?: string | null }).gscRefreshToken;
    const storedAccess = (client as { gscAccessToken?: string | null }).gscAccessToken;
    const tokenExpiry = (client as { gscTokenExpiry?: string | null }).gscTokenExpiry;

    if (!client.gscConnected || !siteUrl || (!storedAccess && !refreshToken)) {
      return NextResponse.json(
        { error: "Client is not connected to Google Search Console" },
        { status: 400 },
      );
    }

    step = "token";
    let accessToken = storedAccess || "";
    const expired = !accessToken || (tokenExpiry && new Date(tokenExpiry) < new Date());
    if (expired) {
      if (!refreshToken) {
        return NextResponse.json(
          { error: "GSC access token expired and no refresh token is stored — reconnect GSC" },
          { status: 400 },
        );
      }
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      // Persist the refreshed token (best-effort).
      await payload
        .update({
          collection: "clients",
          id: clientId,
          data: { gscAccessToken: accessToken, gscTokenExpiry: refreshed.expiry },
          overrideAccess: true,
        })
        .catch(() => {});
    }

    const domain = siteUrl.startsWith("sc-domain:")
      ? siteUrl.slice("sc-domain:".length)
      : siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    // Create a pending record up-front so the run is visible if it crashes.
    step = "create-record";
    const created = await payload.create({
      collection: "seo-migration-checks",
      data: {
        client: Number(clientId),
        siteUrl,
        cutoverDate,
        isDomainMove: !!isDomainMove,
        status: "running",
        title: `${domain} — migration review (${cutoverDate})`,
      },
      overrideAccess: true,
    });

    step = "run-check";
    const brandTerms = parseBrandTerms(
      (client as { brandKeywords?: string | null }).brandKeywords,
    );
    try {
      const result = await runMigrationCheck({
        siteUrl,
        accessToken,
        cutoverDate,
        brandTerms,
        isDomainMove: !!isDomainMove,
      });

      step = "persist-result";
      // JSON fields (checklist/redirects/performance/actions) are generated as
      // broad JSON types; our strongly-typed result objects are structurally
      // compatible, so assert the data shape to select the by-id overload.
      const updateData = {
        status: "completed",
        overallScore: result.overallScore,
        runAt: result.runAt,
        scoresByPhase: result.scoresByPhase,
        checklist: result.checklist,
        redirects: result.redirects,
        performance: result.performance ?? {},
        actions: result.actions,
      } as Record<string, unknown>;
      const saved = await payload.update({
        collection: "seo-migration-checks",
        id: created.id,
        data: updateData,
        overrideAccess: true,
      });

      return NextResponse.json({ ok: true, id: saved.id, result });
    } catch (runErr) {
      const message = runErr instanceof Error ? runErr.message : "Review failed";
      await payload
        .update({
          collection: "seo-migration-checks",
          id: created.id,
          data: { status: "failed", error: message },
          overrideAccess: true,
        })
        .catch(() => {});
      throw runErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run migration check";
    console.error(`[gsc/migration-check] failed at step="${step}":`, message);
    return NextResponse.json({ error: message, step }, { status: 500 });
  }
}
