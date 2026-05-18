import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const ALLOWED_HOSTS = [/\.public\.blob\.vercel-storage\.com$/];

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

  // Runtime allowlist — defends against legacy rows that pre-date the field validator.
  // A non-admin staffer must not be able to make this proxy serve arbitrary HTML under
  // the CMS origin (would enable staff → admin XSS via authenticated same-origin fetch).
  let target: URL;
  try {
    target = new URL(mockupUrl, req.url);
  } catch {
    return new NextResponse("Bad mockup URL", { status: 400 });
  }
  const sameOrigin = target.origin === new URL(req.url).origin;
  if (!sameOrigin && !ALLOWED_HOSTS.some((re) => re.test(target.hostname))) {
    return new NextResponse("Mockup host not allowed", { status: 400 });
  }

  // Fetch the HTML from Vercel Blob and serve it inline
  const upstream = await fetch(target.toString());

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
      // Defense-in-depth: sandbox the proxied HTML so scripts cannot run with our origin's
      // authority even if the allowlist is somehow bypassed. The empty token list is the
      // most restrictive form (no scripts, no forms, no same-origin, no top nav).
      "Content-Security-Policy": "sandbox",
    },
  });
}
