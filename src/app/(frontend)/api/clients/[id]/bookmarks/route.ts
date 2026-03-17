import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    // Auth check
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch client
    let client: any;
    try {
      client = await payload.findByID({
        collection: "clients",
        id,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const name = escapeHtml(client.name || "Client");
    const slug = client.slug || "client";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Build bookmark entries
    const bookmarks: string[] = [];

    // Website
    if (client.websiteUrl) {
      bookmarks.push(
        `        <DT><A HREF="${escapeHtml(client.websiteUrl)}">${name} — Website</A>`
      );
    }

    // Google Ads
    if (client.googleAdsCustomerId) {
      const customerIdNoDashes = client.googleAdsCustomerId.replace(/-/g, "");
      bookmarks.push(
        `        <DT><A HREF="https://ads.google.com/aw/overview?ocid=${escapeHtml(customerIdNoDashes)}">${name} — Google Ads</A>`
      );
    }

    // GA4
    if (client.ga4PropertyId) {
      bookmarks.push(
        `        <DT><A HREF="https://analytics.google.com/analytics/web/#/p${escapeHtml(client.ga4PropertyId)}/reports/reportinghub">${name} — GA4</A>`
      );
    }

    // GTM
    if (client.gtmContainerId) {
      bookmarks.push(
        `        <DT><A HREF="https://tagmanager.google.com/#/container/accounts/all/containers/${escapeHtml(client.gtmContainerId)}">${name} — GTM</A>`
      );
    }

    // Search Console
    if (client.gscPropertyUrl) {
      bookmarks.push(
        `        <DT><A HREF="https://search.google.com/search-console?resource_id=${encodeURIComponent(client.gscPropertyUrl)}">${name} — Search Console</A>`
      );
    }

    // CMS (always included)
    bookmarks.push(
      `        <DT><A HREF="https://cms.optimisedigital.com.au/admin/collections/clients/${id}">${name} — CMS</A>`
    );

    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${name}</H3>
    <DL><p>
${bookmarks.join("\n")}
    </DL><p>
</DL><p>
`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${slug}-bookmarks.html"`,
      },
    });
  } catch (err) {
    console.error("[clients/bookmarks] error:", err);
    return NextResponse.json(
      { error: "Failed to generate bookmarks" },
      { status: 500 }
    );
  }
}
