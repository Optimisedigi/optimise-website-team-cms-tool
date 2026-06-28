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
    const clientId = url.searchParams.get("clientId")?.trim();

    const result = await payload.find({
      collection: "blog-prompts",
      sort: "-createdAt",
      limit: 200,
      ...(clientId
        ? {
            where: {
              or: [
                { client: { equals: clientId } },
                { client: { exists: false } },
              ],
            },
          }
        : {}),
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
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.client) {
      return NextResponse.json({ error: "client is required" }, { status: 400 });
    }

    const doc = await payload.create({
      collection: "blog-prompts",
      data: { ...body, workflowStatus: body.workflowStatus || "idea_phase" },
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
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
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
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
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
