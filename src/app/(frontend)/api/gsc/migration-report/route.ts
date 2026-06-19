import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { processSeoMigrationTracking } from "@/lib/seo-migration-tracking";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const reviewId = req.nextUrl.searchParams.get("reviewId");
    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!reviewId && !clientId) return NextResponse.json({ error: "reviewId or clientId is required" }, { status: 400 });

    const where: any = reviewId ? { id: { equals: reviewId } } : { client: { equals: Number(clientId) } };
    const reviews = await payload.find({ collection: "seo-migration-checks", where, sort: "-createdAt", limit: reviewId ? 1 : 10 });
    return NextResponse.json({ reviews: reviews.docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load migration report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const reviewId = body.reviewId || req.nextUrl.searchParams.get("reviewId");
    if (!reviewId) return NextResponse.json({ error: "reviewId is required" }, { status: 400 });

    const accessible = await payload.find({
      collection: "seo-migration-checks",
      where: { id: { equals: reviewId } } as any,
      limit: 1,
    });
    if (!accessible.docs.length) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    const results = await processSeoMigrationTracking({ reviewId, sendEmails: body.sendEmails === true });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh migration report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
