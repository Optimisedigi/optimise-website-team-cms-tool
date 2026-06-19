import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { probeModels } from "@/lib/agents/optimate-google-ads/evals/model-probe";
import { runOptimateGoogleAdsEval } from "@/lib/agents/optimate-google-ads/evals/runner";
import { buildEvalReportSummary } from "@/lib/agents/optimate-google-ads/evals/report";
import { isCanonicalModel, type CanonicalModelName } from "@/lib/agents/_shared/llm/registry";
import type { EvalCaseCategory } from "@/lib/agents/optimate-google-ads/evals/cases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_MODELS: CanonicalModelName[] = [
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "claude-opus-4-8",
  "minimax-m3",
];

interface RequestBody {
  action?: "probe" | "run";
  models?: string[];
  auditId?: string | number;
  clientId?: string | number;
  customerId?: string;
  cases?: "read-only" | "actions" | "all" | EvalCaseCategory[];
  caseIds?: string[];
  repeats?: number;
  concurrency?: number;
  allowActions?: boolean;
}

export async function POST(request: Request) {
  const auth = request.headers.get("x-internal-api-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.INTERNAL_API_KEY || auth !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const models = parseModels(body.models);

  if (body.action === "probe") {
    const report = await probeModels(models);
    return NextResponse.json({ ok: true, report });
  }

  if (body.action === "run") {
    const auditId = await resolveAuditId(body);
    const result = await runOptimateGoogleAdsEval({
      auditId,
      models,
      categories: body.caseIds?.length ? undefined : parseCategories(body.cases),
      caseIds: body.caseIds,
      repeats: body.repeats ?? 1,
      concurrency: body.concurrency ?? 1,
      allowActions: body.allowActions === true,
      outputDir: "/tmp/optimate-evals",
    });
    return NextResponse.json({
      ok: true,
      result: result.result,
      summary: buildEvalReportSummary(result.result),
    });
  }

  return NextResponse.json({ error: "Unknown action. Use probe or run." }, { status: 400 });
}

function parseModels(models?: string[]): CanonicalModelName[] {
  if (!models || models.length === 0) return DEFAULT_MODELS;
  return models.map((model) => {
    if (!isCanonicalModel(model)) throw new Error(`Unknown model: ${model}`);
    return model;
  });
}

function parseCategories(cases: RequestBody["cases"]): EvalCaseCategory[] | undefined {
  if (!cases || cases === "read-only") return ["read-only"];
  if (cases === "actions") return ["actions", "confirm-gated", "email-scheduled", "memory-context"];
  if (cases === "all") return undefined;
  return cases;
}

async function resolveAuditId(body: RequestBody): Promise<string | number> {
  if (body.auditId) return body.auditId;

  const payload = await getPayload({ config });
  if (body.clientId) {
    const client = await payload.findByID({ collection: "clients" as never, id: body.clientId as never, depth: 0, overrideAccess: true });
    const customerId = (client as { googleAdsCustomerId?: string | null }).googleAdsCustomerId;
    if (!customerId) throw new Error(`Client ${body.clientId} has no googleAdsCustomerId`);
    return findOrCreateLightweightAudit(customerId, (client as { name?: string | null }).name ?? `Client ${body.clientId}`, body.clientId);
  }

  if (body.customerId) {
    return findOrCreateLightweightAudit(body.customerId, `Google Ads ${body.customerId}`, undefined);
  }

  throw new Error("Provide auditId, clientId, or customerId for run action.");
}

async function findOrCreateLightweightAudit(customerId: string, businessName: string, clientId?: string | number): Promise<string | number> {
  const payload = await getPayload({ config });
  const existing = await payload.find({
    collection: "google-ads-audits" as never,
    where: { customerId: { equals: customerId } } as never,
    limit: 1,
    sort: "-updatedAt",
    depth: 0,
    overrideAccess: true,
  });
  const found = existing.docs[0] as { id?: string | number } | undefined;
  if (found?.id) return found.id;

  const created = await payload.create({
    collection: "google-ads-audits" as never,
    data: {
      businessName,
      slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "google-ads"}-${Date.now()}`,
      customerId,
      ...(clientId ? { client: Number(clientId) } : {}),
    } as never,
    overrideAccess: true,
  });
  return (created as { id: string | number }).id;
}
