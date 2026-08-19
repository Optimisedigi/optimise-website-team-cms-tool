import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import config from "@/payload.config";
import { validateDashboardToken } from "../../api/dashboard/verify/route";
import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";
import { DashboardPinEntry } from "@/components/dashboards/shared/DashboardPinEntry";
import { PinGateFrame } from "@/components/PinGateFrame";
import "../../google-dashboard/globals.css";

// The PIN gate and header type in these faces; without the variables they fall
// back to system-ui and the page stops matching the Ads dashboard it sits beside.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * Standalone landing A/B and behaviour reporting for one client.
 *
 * This exists separately from the Google Ads dashboard because that page cannot
 * render at all when Growth Tools has no Google Ads data for the client — which
 * would make landing reporting unreachable for any client that runs landing
 * pages without a connected Ads account, or during a Growth Tools outage.
 * Landing events do not depend on Google Ads, so neither should the page that
 * reports them.
 *
 * The same Landing A/B tab is still available inside the Ads dashboard when
 * that page renders, so this adds a route rather than moving anything.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<{ title: string }> {
  const { slug } = await params;
  return { title: `Landing performance | ${slug}` };
}

export default async function LandingDashboardPage({ params }: Props) {
  const { slug } = await params;

  const payload = await getPayload({ config });
  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  const client = clients.docs[0];
  if (!client) notFound();

  const cookieStore = await cookies();
  const isAuthenticated = validateDashboardToken(cookieStore.get("dashboard_token")?.value, slug);

  if (!isAuthenticated) {
    return (
      <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <PinGateFrame
          eyebrow="Landing Performance"
          title={client.name}
          subtitle="Enter your 4-digit PIN access code to view the dashboard"
        >
          <DashboardPinEntry slug={slug} redirectTo={`/landing-dashboard/${slug}`} />
        </PinGateFrame>
      </div>
    );
  }

  return (
    <main
      className={`od-dashboard-root min-h-screen bg-slate-50 text-slate-900 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-[11px] pb-6">
        {/* Same title lockup as the Google Ads dashboard: the client's name
            carries the weight, and the grey label says which report this is. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-[20px]">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="font-bold tracking-tight text-slate-900 leading-tight my-0"
              style={{ fontSize: "26px", transform: "translateY(-1px)" }}
            >
              {client.name}
            </h1>
            <span className="text-slate-400 font-normal" style={{ fontSize: "18px" }}>
              Landing Performance
            </span>
          </div>
        </div>

        {/* The report renders its own cards, so this page provides the field
            they sit on rather than a second card around them. */}
        <LandingExperimentTab slug={slug} />
      </div>

      {/* Quiet brand sign-off at the end of the document, not pinned to the
          viewport: it belongs after the report, where you arrive once you have
          read it, rather than floating over the numbers the whole way down. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10 flex justify-end">
        <img
          src="/optimise-digital-logo-black.webp"
          alt=""
          aria-hidden="true"
          width={150}
          height={Math.round((150 * 151) / 1068)}
          style={{ display: "block", width: 150, height: "auto", opacity: 0.7 }}
        />
      </div>
    </main>
  );
}
