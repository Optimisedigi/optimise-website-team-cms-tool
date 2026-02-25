import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

export async function GET() {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await payload.find({
      collection: "clients",
      where: { isActive: { equals: true } },
      sort: "name",
      limit: 500,
      select: { name: true, slug: true, gscConnected: true, blogCategories: true, blogTags: true, servicePages: true } as any,
    });

    const clients = result.docs.map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      gscConnected: c.gscConnected || false,
      blogCategories: c.blogCategories || '',
      blogTags: c.blogTags || '',
      servicePages: c.servicePages || '',
    }));

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[clients/list] error:", err);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 },
    );
  }
}
