import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { websiteMockupUrl: true },
  });

  const proposal = result.docs[0] as any;
  const mockupUrl = proposal?.websiteMockupUrl as string | undefined;

  if (!mockupUrl) {
    return new NextResponse("Mockup not found", { status: 404 });
  }

  // If it's a relative path (e.g. /mockups/purples/index.html), redirect directly
  if (mockupUrl.startsWith("/")) {
    return NextResponse.redirect(new URL(mockupUrl, req.url));
  }

  // Fetch the HTML from Vercel Blob and serve it inline
  const upstream = await fetch(mockupUrl);

  if (!upstream.ok) {
    return new NextResponse("Failed to load mockup", { status: 502 });
  }

  const html = await upstream.arrayBuffer();

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
