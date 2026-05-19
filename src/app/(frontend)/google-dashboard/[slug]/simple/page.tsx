import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { SimpleDashboardClient } from "./SimpleDashboardClient";
import { validateDashboardToken } from "../../../api/dashboard/verify/route";
import type { GoogleAdsDashboardData } from "@/lib/dashboard-types";
import "../../globals.css";

/**
 * Simple (stakeholder) Google Ads dashboard.
 *
 * One-page view for execs / stakeholders who don't live in the
 * marketing weeds. Same client + PIN as /google-dashboard/[slug], same
 * Growth Tools data — just stripped to the four headline KPIs, a
 * 14-month conversions-by-type stacked bar, top 10 keywords by
 * conversion + spend, and the GA4 channel split.
 *
 * Co-located under /google-dashboard/[slug]/simple so the PIN cookie
 * (which is bound to the slug) works without a separate auth flow.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<{
  title: string;
  robots: { index: boolean; follow: boolean };
}> {
  const { slug } = await params;
  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });
    const result = await payload.find({
      collection: "clients",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
      select: { name: true },
    });
    const client = result.docs[0] as { name?: string } | undefined;
    if (client?.name) {
      return {
        title: `Google Ads: ${client.name} · Optimise Digital`,
        robots: { index: false, follow: false },
      };
    }
  } catch {
    // fall through to default
  }
  return {
    title: "Google Ads · Optimise Digital",
    robots: { index: false, follow: false },
  };
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
  if (!url || !key) {
    return {
      data: null,
      error: `Service not configured (url: ${!!url}, key: ${!!key})`,
    };
  }
  try {
    const cleanCustomerId = customerId.replace(/-/g, "");
    const params = new URLSearchParams({
      range: "this_month",
      customerId: cleanCustomerId,
      clientName,
    });
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (conversionActions) {
      const normalized = conversionActions
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(",");
      if (normalized) params.set("conversionActions", normalized);
    }
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
    return {
      data: null,
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export default async function SimpleDashboardPage({ params }: Props) {
  const { slug } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const clientResult = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug }, isActive: { equals: true } },
    limit: 1,
    overrideAccess: true,
    select: {
      id: true,
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

  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("dashboard_token")?.value;
  const isAuthenticated = validateDashboardToken(tokenCookie, slug);

  let initialData: GoogleAdsDashboardData | null = null;
  let fetchError: string | null = null;
  if (isAuthenticated) {
    const result = await fetchDashboardData(
      slug,
      client.googleAdsCustomerId,
      client.name,
      client.brandKeywords,
      client.dashboardConversionActions,
    );
    initialData = result.data;
    fetchError = result.error;
  }

  return (
    <SimpleDashboardClient
      slug={slug}
      clientId={client.id as string}
      clientName={client.name}
      isAuthenticated={isAuthenticated}
      initialData={initialData}
      initialError={fetchError}
      brandKeywords={client.brandKeywords || ""}
      defaultConversionActions={client.dashboardConversionActions || ""}
      phoneCallActions={(client as any).phoneCallConversionActions || ""}
      formSubmitActions={(client as any).formSubmitConversionActions || ""}
      conversionActionCategories={(() => {
        const arr = (client as any).conversionActionCategories;
        if (Array.isArray(arr) && arr.length > 0) {
          return JSON.stringify(
            arr
              .map((c: any) => ({
                label: String(c?.label || "").trim(),
                color: String(c?.color || "sky"),
                actions: String(c?.actions || "")
                  .split(/[\r\n]+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
              .filter((c: any) => c.label && c.actions.length > 0),
          );
        }
        const phone = String((client as any).phoneCallConversionActions || "")
          .split(/[\r\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const form = String((client as any).formSubmitConversionActions || "")
          .split(/[\r\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const fallback: Array<{ label: string; color: string; actions: string[] }> = [];
        if (phone.length > 0) fallback.push({ label: "Phone Calls", color: "sky", actions: phone });
        if (form.length > 0)
          fallback.push({ label: "Form Submits", color: "violet", actions: form });
        return fallback.length > 0 ? JSON.stringify(fallback) : "";
      })()}
    />
  );
}
