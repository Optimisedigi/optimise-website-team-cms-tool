import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

async function getAuthedPayload() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) return null;
  return payload;
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getAuthedPayload();
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const showArchived = url.searchParams.get("archived") === "true";

    // Lazy cleanup: delete briefs archived more than 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await payload.delete({
        collection: "blog-prompts",
        where: {
          archivedAt: { less_than: tenDaysAgo, exists: true },
        },
        overrideAccess: true,
      });
    } catch {
      // cleanup is best-effort
    }

    const result = await payload.find({
      collection: "blog-prompts",
      sort: "-createdAt",
      limit: 50,
      where: showArchived
        ? { archivedAt: { exists: true } }
        : { archivedAt: { exists: false } },
      overrideAccess: true,
    });

    return NextResponse.json({ docs: result.docs });
  } catch (err) {
    console.error("[blog-prompts GET] error:", err);
    return NextResponse.json({ error: "Failed to load briefs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await getAuthedPayload();
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const doc = await payload.create({
      collection: "blog-prompts",
      data: body,
      overrideAccess: true,
    });

    return NextResponse.json({ doc });
  } catch (err) {
    console.error("[blog-prompts POST] error:", err);
    return NextResponse.json({ error: "Failed to save brief" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await getAuthedPayload();
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await payload.update({
      collection: "blog-prompts",
      id,
      data: { archivedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    return NextResponse.json({ doc });
  } catch (err) {
    console.error("[blog-prompts PATCH] error:", err);
    return NextResponse.json({ error: "Failed to archive brief" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await getAuthedPayload();
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await payload.delete({
      collection: "blog-prompts",
      id,
      overrideAccess: true,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[blog-prompts DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete brief" }, { status: 500 });
  }
}
