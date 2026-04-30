import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("dashboard_token")?.value;
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const clientId = searchParams.get("clientId");

  if (!slug || !clientId || !validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Return the most recent pending session for this client
  const result = await payload.find({
    collection: "keyword-deep-dive-sessions",
    where: { client: { equals: clientId }, status: { equals: "pending" } },
    sort: "-createdAt",
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0] as unknown as
    | (Record<string, unknown> & { keywords?: Array<{ keyword: string }> })
    | undefined;

  const keywords: string[] = (doc?.keywords ?? []).map((k) => k.keyword);
  return NextResponse.json({
    keywords,
    sessionId: doc?.id,
    title: doc?.title,
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("dashboard_token")?.value;
    const body = await req.json();
    const { clientId, slug, selectedTerms, title } = body;

    if (!validateDashboardToken(token, slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!clientId || !slug || !Array.isArray(selectedTerms)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    // Resolve the latest Google Ads audit for this client so we can link the
    // submit to it. The dashboard only knows the Google Ads customer ID
    // (e.g. "8230563869") — not the Payload audit document ID — so we look
    // it up server-side. Optional: skip if no audit exists yet.
    let googleAdsAuditDocId: number | undefined;
    try {
      const audits = await payload.find({
        collection: "google-ads-audits",
        where: { client: { equals: clientId } },
        sort: "-createdAt",
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const latest = (audits.docs as any[])[0];
      if (latest?.id) googleAdsAuditDocId = latest.id as number;
    } catch {
      // Non-fatal — still create the submit without the audit link.
    }

    // Dedupe: drop any term that already exists for this client in either
    // (a) a previous submit (any status) or (b) a live Negative Keyword List.
    // Match is case-insensitive on the keyword text (match type ignored —
    // "ag cylinders" already negated as exact shouldn't be re-flagged as a
    // new submit).
    const existingKeywords = new Set<string>();
    try {
      const [priorSubmits, nkls] = await Promise.all([
        payload.find({
          collection: "keyword-deep-dive-sessions",
          where: { client: { equals: clientId } },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        }),
        payload.find({
          collection: "negative-keyword-lists",
          where: { client: { equals: clientId } },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        }),
      ]);
      for (const doc of priorSubmits.docs as any[]) {
        for (const k of (doc.keywords as any[]) ?? []) {
          if (typeof k?.keyword === "string") {
            existingKeywords.add(k.keyword.trim().toLowerCase());
          }
        }
      }
      for (const list of nkls.docs as any[]) {
        for (const k of (list.keywords as any[]) ?? []) {
          if (typeof k?.keyword === "string") {
            existingKeywords.add(k.keyword.trim().toLowerCase());
          }
        }
      }
    } catch (err) {
      // Non-fatal — if the dedupe lookup fails we'll just create the submit
      // with the original list of terms (worst case: a duplicate sneaks in).
      console.warn("[keyword-selections POST] dedupe lookup failed:", err);
    }

    const seenInBatch = new Set<string>();
    const newTerms: string[] = [];
    let skipped = 0;
    for (const raw of selectedTerms) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const norm = trimmed.toLowerCase();
      if (seenInBatch.has(norm)) {
        skipped += 1;
        continue;
      }
      seenInBatch.add(norm);
      if (existingKeywords.has(norm)) {
        skipped += 1;
        continue;
      }
      newTerms.push(trimmed);
    }

    // If everything was a duplicate, don't create an empty submit — just
    // tell the dashboard there was nothing new to save.
    if (newTerms.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        skipped,
        sessionId: null,
        message:
          "All selected terms are already saved or in your negative keyword lists. Nothing new to send.",
      });
    }

    const keywords = newTerms.map((term) => ({
      keyword: term,
      matchType: "exact" as const,
      flaggedForRemoval: false,
    }));

    // Create a new submit every time the user saves
    const session = await payload.create({
      collection: "keyword-deep-dive-sessions",
      data: {
        client: clientId,
        googleAdsAudit: googleAdsAuditDocId,
        title: title ?? undefined,
        keywords,
        status: "pending",
      },
      overrideAccess: true,
    });

    return NextResponse.json({
      success: true,
      count: newTerms.length,
      skipped,
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("[keyword-selections POST] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save keyword selections" },
      { status: 500 },
    );
  }
}
