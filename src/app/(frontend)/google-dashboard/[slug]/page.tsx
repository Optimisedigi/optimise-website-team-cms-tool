import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { DashboardClient } from "./DashboardClient";
import { validateDashboardToken } from "../../api/dashboard/verify/route";
import type { GoogleAdsDashboardData, GoogleAdsDashboardQualityData } from "@/lib/dashboard-types";
import "../globals.css";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchDashboardData(
  slug: string,
  customerId: string,
  clientName: string,
  brandKeywords?: string,
  conversionActions?: string,
): Promise<{ data: GoogleAdsDashboardData | null; error: string | null }> {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key) return { data: null, error: `Service not configured (url: ${!!url}, key: ${!!key})` };

  try {
    const params = new URLSearchParams({ range: "this_month", customerId, clientName });
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (conversionActions) params.set("conversionActions", conversionActions);
    const endpoint = `${url}/api/google-ads/dashboard/${encodeURIComponent(slug)}?${params}`;
    const res = await fetch(endpoint, {
      headers: { "x-internal-key": key },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: `Growth Tools ${res.status}: ${text}` };
    }
    return { data: await res.json(), error: null };
  } catch (err) {
    return { data: null, error: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export default async function GoogleDashboardPage({ params }: Props) {
  const { slug } = await params;

  // Validate that a client with this slug exists and has Google Ads configured
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const clientResult = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      name: true,
      clientPin: true,
      googleAdsCustomerId: true,
      brandKeywords: true,
      dashboardConversionActions: true,
    },
  });

  const client = clientResult.docs[0] as any;
  if (!client || !client.googleAdsCustomerId) {
    notFound();
  }

  // Check if user has a valid dashboard session (HMAC-signed cookie)
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("dashboard_token")?.value;
  const isAuthenticated = validateDashboardToken(tokenCookie, slug);

  // If authenticated, fetch dashboard data and quality scores server-side
  let initialData: GoogleAdsDashboardData | null = null;
  let fetchError: string | null = null;
  let initialQualityData: GoogleAdsDashboardQualityData | null = null;
  if (isAuthenticated) {
    const result = await fetchDashboardData(slug, client.googleAdsCustomerId, client.name, client.brandKeywords, client.dashboardConversionActions);
    initialData = result.data;
    fetchError = result.error;

    // Fetch quality scores server-side to avoid cookie auth issues on client
    const growthUrl = process.env.GROWTH_TOOLS_URL;
    const apiKey = process.env.INTERNAL_API_KEY;
    if (growthUrl && apiKey) {
      try {
        const qsRes = await fetch(
          `${growthUrl}/api/google-ads/dashboard/${encodeURIComponent(slug)}/quality-scores?customerId=${encodeURIComponent(client.googleAdsCustomerId)}`,
          { headers: { "x-internal-key": apiKey }, cache: "no-store" },
        );
        if (qsRes.ok) {
          initialQualityData = await qsRes.json();
        }
      } catch {
        // Quality scores are supplementary — fail silently
      }
    }
  }

  return (
    <DashboardClient
      slug={slug}
      clientName={client.name}
      isAuthenticated={isAuthenticated}
      initialData={initialData}
      initialError={fetchError}
      initialQualityData={initialQualityData}
      brandKeywords={client.brandKeywords || ""}
      conversionActions={client.dashboardConversionActions || ""}
    />
  );
}
