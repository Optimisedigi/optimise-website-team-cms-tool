/**
 * GET /api/goal-agents/baseline
 *
 *   ?goalRunId=   → baseline + live progress for that run
 *   ?clientId=    → same, for the client's most recent goal run
 *   (no params)   → list of goal runs to pick from
 *
 * Returns the frozen pre-run baseline stored on the goal-runs row. If the run
 * has no baseline yet (runs created before this feature), it is computed from
 * Google Ads via Growth Tools and frozen on first read — freezing only
 * happens when every window fetched cleanly, so a Growth Tools blip never
 * becomes the permanent anchor. The "current" windows are always fetched
 * live so progress is measured against the fixed baseline.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import {
  captureGoalRunBaseline,
  currentWindows,
  fetchBaselinePoint,
  isGoalRunBaseline,
  normaliseScope,
  type BaselinePoint,
  type GoalRunBaseline,
} from "@/lib/goal-agents/baseline";
import {
  emptyProgress,
  isGoalRunProgress,
  runTimeline,
  type GoalRunProgress,
} from "@/lib/goal-agents/progress-shared";

export const dynamic = "force-dynamic";

interface RawGoalRunDoc {
  id: number | string;
  goal?: string | null;
  status?: string | null;
  client?: number | string | { id?: number | string; name?: string; googleAdsCustomerId?: string | null } | null;
  parameters?: Record<string, unknown> | null;
  baseline?: unknown;
  progress?: unknown;
  createdAt?: string | null;
  completedAt?: string | null;
  nextCheckAt?: string | null;
}

interface RawClientDoc {
  id: number | string;
  name?: string | null;
  googleAdsCustomerId?: string | null;
}

function clientIdOf(raw: RawGoalRunDoc["client"]): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw);
  if (raw && typeof raw === "object" && raw.id !== undefined) return Number(raw.id);
  return null;
}

function normaliseCustomerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/-/g, "");
  return trimmed || null;
}

function parseId(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!userHasFeature(user, "nav:google-ads")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const goalRunId = parseId(searchParams.get("goalRunId"));
  const clientId = parseId(searchParams.get("clientId"));

  // ── List mode ────────────────────────────────────────────────────────────
  if (!goalRunId && !clientId) {
    const runs = await payload.find({
      collection: "goal-runs",
      sort: "-createdAt",
      limit: 100,
      depth: 1,
      overrideAccess: true,
    });
    const list = (runs.docs as unknown as RawGoalRunDoc[]).map((r) => {
      const client = r.client && typeof r.client === "object" ? r.client : null;
      return {
        id: Number(r.id),
        goal: r.goal ?? null,
        status: r.status ?? null,
        createdAt: r.createdAt ?? null,
        clientId: clientIdOf(r.client),
        clientName: client?.name ?? null,
        hasBaseline: isGoalRunBaseline(r.baseline),
      };
    });
    return NextResponse.json({ runs: list });
  }

  // ── Resolve the run ──────────────────────────────────────────────────────
  const where = goalRunId
    ? { id: { equals: goalRunId } }
    : { client: { equals: clientId } };
  const found = await payload.find({
    collection: "goal-runs",
    where: where as never,
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const run = (found.docs as unknown as RawGoalRunDoc[])[0];
  if (!run) return NextResponse.json({ error: "Goal run not found" }, { status: 404 });

  const runClientId = clientIdOf(run.client);
  if (clientId && runClientId !== clientId) {
    return NextResponse.json({ error: "Goal run does not belong to that client" }, { status: 404 });
  }
  if (!runClientId) {
    return NextResponse.json({ error: "Goal run has no client" }, { status: 422 });
  }

  const clientDoc = (await payload.findByID({
    collection: "clients",
    id: runClientId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as RawClientDoc | null;
  const customerId = normaliseCustomerId(clientDoc?.googleAdsCustomerId);
  if (!customerId) {
    return NextResponse.json(
      { error: "Client has no Google Ads customer ID configured" },
      { status: 422 },
    );
  }

  const runStartedAt = run.createdAt ? new Date(run.createdAt) : null;
  if (!runStartedAt || Number.isNaN(runStartedAt.getTime())) {
    return NextResponse.json({ error: "Goal run has no valid createdAt" }, { status: 422 });
  }

  const includedCampaignIds = run.parameters?.includedCampaignIds;

  // ── Frozen baseline (capture on first read) ──────────────────────────────
  let baseline: GoalRunBaseline | null = isGoalRunBaseline(run.baseline) ? run.baseline : null;
  let baselineError: string | null = null;
  if (!baseline) {
    const captured = await captureGoalRunBaseline({
      payload,
      goalRunId: Number(run.id),
      customerId,
      runStartedAt,
      includedCampaignIds,
    });
    if (captured.ok) baseline = captured.baseline;
    else baselineError = captured.error;
  }

  // ── Live progress windows ────────────────────────────────────────────────
  const scope = baseline?.scope.includedCampaignIds ?? normaliseScope(includedCampaignIds);
  const live = currentWindows(runStartedAt, new Date());
  const [sinceStart, last7] = await Promise.all([
    fetchBaselinePoint({
      customerId,
      scope,
      window: { key: "week", label: "Since run started", offsetDays: 0, ...live.sinceStart },
    }),
    fetchBaselinePoint({
      customerId,
      scope,
      window: { key: "week", label: "Latest 7 days", offsetDays: 0, ...live.last7 },
    }),
  ]);

  const current: {
    sinceStart: BaselinePoint | null;
    last7: BaselinePoint | null;
    errors: string[];
  } = { sinceStart: null, last7: null, errors: [] };
  if (sinceStart.ok) current.sinceStart = sinceStart.point;
  else current.errors.push(`Since run started: ${sinceStart.error}`);
  if (last7.ok) current.last7 = last7.point;
  else current.errors.push(`Latest 7 days: ${last7.error}`);

  // The status bar spans the run horizon (how long the agent keeps looking),
  // not the 14-day post-change measurement cycle.
  const measurementDays =
    typeof run.parameters?.runDurationDays === "number" ? run.parameters.runDurationDays : 42;
  const progress: GoalRunProgress = isGoalRunProgress(run.progress) ? run.progress : emptyProgress();
  const now = new Date();

  return NextResponse.json({
    goalRun: {
      id: Number(run.id),
      goal: run.goal ?? null,
      status: run.status ?? null,
      createdAt: runStartedAt.toISOString(),
      completedAt: run.completedAt ?? null,
      nextCheckAt: run.nextCheckAt ?? null,
      clientId: runClientId,
      clientName: clientDoc?.name ?? null,
      customerId,
      targetImprovementPercent:
        typeof run.parameters?.targetImprovementPercent === "number"
          ? run.parameters.targetImprovementPercent
          : null,
      measurementDays,
      enabledLevers: Array.isArray(run.parameters?.enabledLevers)
        ? run.parameters.enabledLevers.filter((l): l is string => typeof l === "string")
        : [],
    },
    timeline: runTimeline({
      createdAt: runStartedAt.toISOString(),
      completedAt: run.completedAt ?? null,
      status: run.status ?? null,
      measurementDays,
      now,
    }),
    serverNow: now.toISOString(),
    baseline,
    baselineError,
    current,
    progress,
  });
}
