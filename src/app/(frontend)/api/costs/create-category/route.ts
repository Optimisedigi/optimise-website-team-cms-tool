import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "cost-categories")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const doc = await payload.create({
      collection: "cost-categories",
      data: {
        name: name.trim(),
        color: color || "#4A90D9",
        isActive: true,
      },
      overrideAccess: true,
    });

    return NextResponse.json({ id: doc.id, name: doc.name, color: (doc as any).color });
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
    }
    console.error("[costs/create-category] error:", err);
    return NextResponse.json(
      { error: "Failed to create category", details: String(err) },
      { status: 500 },
    );
  }
}
