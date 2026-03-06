import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { DashboardClient } from "./DashboardClient";
import { validateDashboardToken } from "../../api/dashboard/verify/route";
import type { GoogleAdsDashboardData } from "@/lib/dashboard-types";
import "../globals.css";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchDashboardData(slug: string): Promise<GoogleAdsDashboardData | null> {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/api/google-ads/dashboard/${encodeURIComponent(slug)}?range=last_month`,
      {
        headers: { "x-api-key": key },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
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

  // If authenticated, fetch dashboard data server-side (avoids client cookie issues)
  let initialData: GoogleAdsDashboardData | null = null;
  if (isAuthenticated) {
    initialData = await fetchDashboardData(slug);
  }

  return (
    <DashboardClient
      slug={slug}
      clientName={client.name}
      isAuthenticated={isAuthenticated}
      initialData={initialData}
    />
  );
}
