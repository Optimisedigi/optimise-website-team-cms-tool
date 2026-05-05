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
    // Strip dashes from customerId — Google Ads API uses dashless format
    const cleanCustomerId = customerId.replace(/-/g, "");
    const params = new URLSearchParams({ range: "this_month", customerId: cleanCustomerId, clientName });
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    // dashboardConversionActions is stored newline-separated in the CMS
    // (textarea field), but Growth Tools expects comma-separated values.
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

  // Load any existing deep-dive keyword selections for this client.
  const nklResult = await payload.find({
    collection: "negative-keyword-lists",
    where: { client: { equals: client.id }, source: { equals: "deep_dive" } },
    limit: 1,
    overrideAccess: true,
  });
  const allDeepDiveSelections: string[] =
    (nklResult.docs[0] as any)?.keywords?.map((k: any) => k.keyword) ?? [];

  // Load every keyword from real (synced) NKLs so the dashboard can render
  // promoted terms in an "Added as Negative" state. Same logic as the
  // /api/dashboard/keyword-selections GET handler so the server-rendered
  // first paint matches the hydration fetch.
  const realListsResult = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      and: [
        { client: { equals: client.id } },
        { isActive: { equals: true } },
        { source: { not_equals: "deep_dive" } },
      ],
    },
    limit: 200,
    overrideAccess: true,
  });
  const addedSet = new Set<string>();
  for (const list of realListsResult.docs as any[]) {
    for (const kw of list?.keywords ?? []) {
      if (typeof kw?.keyword === "string" && kw.keyword) {
        addedSet.add(kw.keyword.toLowerCase());
      }
    }
  }

  const initialKeywordSelections: string[] = [];
  const initialAddedSelections: string[] = [];
  for (const term of allDeepDiveSelections) {
    if (addedSet.has(term.toLowerCase())) {
      initialAddedSelections.push(term);
    } else {
      initialKeywordSelections.push(term);
    }
  }
  const initialAddedNegatives: string[] = Array.from(addedSet);

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

    // Fetch quality scores server-side to avoid cookie auth issues on client.
    // Match the dashboard's initial range (this_month) so the Quality Score
    // tab's keyword + ad tables align with the rest of the dashboard.
    const growthUrl = process.env.GROWTH_TOOLS_URL;
    const apiKey = process.env.INTERNAL_API_KEY;
    if (growthUrl && apiKey) {
      try {
        const cleanCid = client.googleAdsCustomerId.replace(/-/g, "");
        const qsParams = new URLSearchParams({
          customerId: cleanCid,
          range: "this_month",
        });
        const qsRes = await fetch(
          `${growthUrl}/api/google-ads/dashboard/${encodeURIComponent(slug)}/quality-scores?${qsParams}`,
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
      clientId={client.id as string}
      clientName={client.name}
      isAuthenticated={isAuthenticated}
      initialData={initialData}
      initialError={fetchError}
      initialQualityData={initialQualityData}
      brandKeywords={client.brandKeywords || ""}
      conversionActions={client.dashboardConversionActions || ""}
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
        // Fallback: build implicit Phone/Form categories from legacy fields
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
        if (form.length > 0) fallback.push({ label: "Form Submits", color: "violet", actions: form });
        return fallback.length > 0 ? JSON.stringify(fallback) : "";
      })()}
      initialKeywordSelections={initialKeywordSelections}
      initialAddedSelections={initialAddedSelections}
      initialAddedNegatives={initialAddedNegatives}
    />
  );
}
