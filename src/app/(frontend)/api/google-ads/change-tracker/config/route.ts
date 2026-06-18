import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

const WORKSPACE_KEY = "default";
const COLLECTION = "google-ads-change-trackers" as any;

function emptyConfig(storageUnavailable = false) {
  const response = NextResponse.json({
    view: "daily",
    graphs: [],
    updatedAt: null,
    storageUnavailable,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireGoogleAdsUser() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) return { payload, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!userHasFeature(user, "nav:google-ads")) {
    return { payload, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { payload, user, error: null };
}

function cleanGraph(graph: any, index: number) {
  const metrics = Array.isArray(graph?.metrics) ? graph.metrics : [];
  const campaigns = Array.isArray(graph?.campaigns) ? graph.campaigns : [];
  const annotations = Array.isArray(graph?.annotations) ? graph.annotations : [];
  return {
    id: Number(graph?.id) || index + 1,
    name: String(graph?.name || (index === 0 ? "Changed campaigns" : `Graph ${index + 1}`)),
    customerId: String(graph?.customerId || "").replace(/-/g, ""),
    campaigns: campaigns.map((campaign: any) => String(campaign)).filter(Boolean),
    campaignSearch: "",
    metrics: metrics.map((metric: any) => String(metric)).filter(Boolean).slice(0, 4),
    changeDate: String(graph?.changeDate || "2026-06-17").slice(0, 10),
    annotations: annotations.map((annotation: any, annotationIndex: number) => ({
      id: Number(annotation?.id) || annotationIndex + 1,
      date: String(annotation?.date || graph?.changeDate || "2026-06-17").slice(0, 10),
      note: String(annotation?.note || "").slice(0, 240),
    })).filter((annotation: any) => annotation.date && annotation.note.trim()),
    showTrend: graph?.showTrend !== false,
    showLabels: graph?.showLabels === true,
    controlsOpen: graph?.controlsOpen !== false,
  };
}

export async function GET() {
  try {
    const { payload, error } = await requireGoogleAdsUser();
    if (error) return error;

    const existing = await payload.find({
      collection: COLLECTION,
      where: { workspaceKey: { equals: WORKSPACE_KEY } },
      limit: 1,
      depth: 0,
    });

    const doc = existing.docs[0] as any;
    const response = NextResponse.json({
      view: doc?.view || "daily",
      graphs: Array.isArray(doc?.graphs) ? doc.graphs.map(cleanGraph) : [],
      updatedAt: doc?.updatedAt || null,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-ads/change-tracker/config GET]", error);
    return emptyConfig(true);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payload, error } = await requireGoogleAdsUser();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const view = body?.view === "weekly" ? "weekly" : "daily";
    const graphs = Array.isArray(body?.graphs) ? body.graphs.map(cleanGraph) : [];

    const existing = await payload.find({
      collection: COLLECTION,
      where: { workspaceKey: { equals: WORKSPACE_KEY } },
      limit: 1,
      depth: 0,
    });

    const data = {
      name: "Default Google Ads Change Tracker",
      workspaceKey: WORKSPACE_KEY,
      view,
      graphs,
    };

    const doc = existing.docs[0] as any;
    if (doc?.id) {
      await payload.update({ collection: COLLECTION, id: doc.id, data });
    } else {
      await payload.create({ collection: COLLECTION, data });
    }

    const response = NextResponse.json({ ok: true, view, graphs });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-ads/change-tracker/config POST]", error);
    return NextResponse.json({ ok: false, error: "Failed to save change tracker config" }, { status: 200 });
  }
}
