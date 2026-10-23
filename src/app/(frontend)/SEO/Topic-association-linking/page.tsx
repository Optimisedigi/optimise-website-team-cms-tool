import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { CONTENT_MAP_BASE_PATH, contentMapPath } from "@/lib/content-map/paths";

export const dynamic = "force-dynamic";
export const metadata = { title: "Topic association linking" };

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
const MUTED = "oklch(0.52 0.01 85)";

/** Index of clients with Content Map switched on, each linking to its topic association page. Staff only. */
export default async function TopicAssociationLinkingIndex() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) redirect(`/admin/login?redirect=${encodeURIComponent(CONTENT_MAP_BASE_PATH)}`);
  const res = await payload.find({
    collection: "clients",
    where: { contentMapEnabled: { equals: true } },
    sort: "name",
    limit: 500,
    depth: 0,
    overrideAccess: false,
    user,
    select: { name: true, slug: true, websiteUrl: true },
  });
  const clients = (res.docs as unknown as Array<{ id: unknown; name?: string; slug?: string; websiteUrl?: string }>).filter((c) => c.slug);
  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.975 0.005 85)", color: "oklch(0.24 0.012 85)", fontFamily: "'Instrument Sans',sans-serif", fontSize: 16, lineHeight: "normal" }}>
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      <header style={{ padding: "14px 24px", borderBottom: "1px solid oklch(0.9 0.006 85)", background: "oklch(0.995 0.002 85)", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ font: "500 11px 'JetBrains Mono',monospace", letterSpacing: ".08em", textTransform: "uppercase", color: MUTED }}>SEO · Internal link map</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.01em" }}>Topic association linking</div>
      </header>
      <main style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
        {clients.length ? (
          clients.map((c) => (
            <a key={String(c.id)} href={contentMapPath(c.slug as string)} style={{ border: "1px solid oklch(0.92 0.006 85)", background: "oklch(0.995 0.002 85)", borderRadius: 8, padding: "11px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "inherit", textDecoration: "none" }}>
              <span style={{ fontWeight: 500, flex: 1 }}>{c.name}</span>
              {c.websiteUrl ? <span style={{ font: "12px 'JetBrains Mono',monospace", color: MUTED }}>{c.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span> : null}
            </a>
          ))
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: MUTED }}>No clients have Content Map switched on yet. Switch it on in a client&apos;s Blog Settings tab → Content Map.</div>
        )}
      </main>
    </div>
  );
}
