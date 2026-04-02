import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const pin = searchParams.get("pin");

  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results = await payload.find({
      collection: "google-ads-audits",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (!results.docs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const audit = results.docs[0] as any;

    if (!audit.adCopyPublished || audit.presentationPin !== pin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ comments: audit.adCopyComments || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, pin } = body;
  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results = await payload.find({
      collection: "google-ads-audits",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (!results.docs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const audit = results.docs[0] as any;

    if (!audit.adCopyPublished || audit.presentationPin !== pin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Handle save-edits action — client edited ad copy directly
    if (body.action === "save-edits" && body.adCopy) {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET generated_ad_copy = ? WHERE id = ?",
        args: [JSON.stringify(body.adCopy), audit.id],
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[ad-copy-comments] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
