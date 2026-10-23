import type { Metadata } from "next";
import { cookies, headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../../api/dashboard/verify/route";
import ContentMapPage from "@/components/content-map/ContentMapPage";
import { DashboardPinEntry } from "@/components/dashboards/shared/DashboardPinEntry";
import { PinGateFrame } from "@/components/PinGateFrame";
import { contentMapPath, findReportClient, resolveClientParam } from "@/lib/content-map/paths";

// Same faces as the other PIN-gated reports, so the login screen matches them.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

type Params = Promise<{ clientSlug: string }>;
type Search = Promise<{ view?: string | string[] }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { clientSlug } = await params;
  // No lookup: the page decides who may see what.
  return { title: `Topic association linking · ${decodeURIComponent(clientSlug).slice(0, 80)} · Optimise Digital`, robots: { index: false, follow: false } };
}

/**
 * /SEO/Topic-association-linking/<client-slug>
 *
 * - Optimise Digital staff (CMS session with access to the client): the team
 *   view — strategy, link actions, write-next briefs. `?view=client` previews
 *   what the client sees.
 * - Clients: the same PIN screen as the Google Ads and landing page reports,
 *   then a read-only view of the approach (no team working state).
 */
export default async function TopicAssociationLinkingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { clientSlug } = await params;
  const { view } = await searchParams;
  const wantsClientView = view === "client";
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  if (user) {
    const client = await resolveClientParam(payload, clientSlug, user);
    if (client) {
      if (client.redirect) redirect(`${contentMapPath(client.slug)}${wantsClientView ? "?view=client" : ""}`);
      return (
        <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
          <ContentMapPage clientId={client.id} slug={client.slug} audience={wantsClientView ? "client" : "team"} staff />
        </div>
      );
    }
    // A signed-in user without access to this client falls through to the client PIN flow.
  }

  const client = await findReportClient(payload, clientSlug);
  if (!client) notFound();
  if (client.slug !== decodeURIComponent(clientSlug)) redirect(contentMapPath(client.slug));
  const path = contentMapPath(client.slug);

  const authed = validateDashboardToken((await cookies()).get("dashboard_token")?.value, client.slug);
  if (!authed) {
    return (
      <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <PinGateFrame
          eyebrow="Topic Association Linking"
          title={client.name}
          subtitle="Enter your 4-digit PIN access code to view your strategy"
          footer={
            <a
              href={`/admin/login?redirect=${encodeURIComponent(path)}`}
              style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 12, letterSpacing: "0.02em", color: "#6f7596", textDecoration: "none" }}
            >
              Optimise Digital team? Sign in
            </a>
          }
        >
          <DashboardPinEntry slug={client.slug} redirectTo={path} />
        </PinGateFrame>
      </div>
    );
  }

  return (
    <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <ContentMapPage clientId="" slug={client.slug} audience="client" />
    </div>
  );
}
