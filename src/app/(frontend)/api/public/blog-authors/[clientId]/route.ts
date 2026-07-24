import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { projectPublicBlogAuthors } from "@/lib/public-blog-authors";

const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<NextResponse> {
  const { clientId: rawClientId } = await params;
  const clientId = Number(rawClientId);

  if (!Number.isSafeInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "clients",
      where: { id: { equals: clientId } },
      depth: 1,
      limit: 1,
      overrideAccess: true,
    });
    const client = result.docs[0];

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(
      { authors: projectPublicBlogAuthors(client.authors) },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[public/blog-authors] Failed to load authors", error);
    return NextResponse.json({ error: "Failed to load authors" }, { status: 500 });
  }
}
