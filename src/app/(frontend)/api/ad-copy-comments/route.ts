import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { randomUUID } from "crypto";

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
  let body: {
    slug?: string;
    pin?: string;
    campaignName?: string;
    adGroupName?: string;
    lineType?: "headline" | "description";
    lineIndex?: number;
    author?: string;
    text?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, pin, campaignName, adGroupName, author, text } = body;

  if (!slug || !pin || !campaignName || !adGroupName || !author?.trim() || !text?.trim()) {
    return NextResponse.json(
      { error: "slug, pin, campaignName, adGroupName, author, and text are required" },
      { status: 400 }
    );
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

    const existingComments = Array.isArray(audit.adCopyComments) ? audit.adCopyComments : [];

    const newComment = {
      id: randomUUID(),
      campaignName,
      adGroupName,
      lineType: body.lineType || null,
      lineIndex: body.lineIndex ?? null,
      author: author.trim(),
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedComments = [...existingComments, newComment];

    // Use direct DB update to avoid Payload re-validating all fields
    const dbClient = (payload.db as any).client;
    await dbClient.execute({
      sql: "UPDATE google_ads_audits SET ad_copy_comments = ? WHERE id = ?",
      args: [JSON.stringify(updatedComments), audit.id],
    });

    return NextResponse.json({ comment: newComment });
  } catch (err) {
    console.error("[ad-copy-comments] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
