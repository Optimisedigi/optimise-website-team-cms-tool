import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../api/dashboard/verify/route";
import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";
import { DashboardPinEntry } from "@/components/dashboards/shared/DashboardPinEntry";
import "../../google-dashboard/globals.css";

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
    return <DashboardPinEntry redirectTo={`/landing-dashboard/${slug}`} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full max-w-7xl px-6">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Landing performance
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{client.name}</h1>
        </header>

        {/* The report renders its own cards, so this page provides the field
            they sit on rather than a second card around them. */}
        <LandingExperimentTab slug={slug} />
      </div>
    </main>
  );
}
