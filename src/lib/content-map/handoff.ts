/**
 * Long AI jobs (research placement, AI-citation analysis) can take several
 * minutes. Page-load routes only get 30 s, so a job started there is cut off
 * before the first model call returns. This hands the job to
 * /api/content-map/insights/run (300 s) instead: one quick authenticated POST
 * sent after the response, and that route runs the job in its own budget.
 */

import { after } from "next/server";

export type InsightsKind = "research" | "citations";

export const INSIGHTS_RUN_PATH = "/api/content-map/insights/run";

/** This deployment's own address (production domain in production, the deployment URL elsewhere). */
export function cmsOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const clean = (v: string | undefined) => (v ? (v.startsWith("http") ? v : `https://${v}`).replace(/\/+$/, "") : null);
  if (env.VERCEL_ENV === "production") return clean(env.NEXT_PUBLIC_SERVER_URL) ?? clean(env.VERCEL_PROJECT_PRODUCTION_URL);
  return clean(env.VERCEL_URL) ?? clean(env.NEXT_PUBLIC_SERVER_URL);
}

/** POST the job to the long-running route. False when it can't be handed off (no URL/secret, or rejected). */
export async function sendInsightsJob(kind: InsightsKind, id: string, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<boolean> {
  const env = deps.env ?? process.env;
  const origin = cmsOrigin(env);
  const secret = env.CRON_SECRET;
  if (!origin || !secret) return false;
  try {
    const res = await (deps.fetch ?? fetch)(`${origin}${INSIGHTS_RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ kind, id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[content-map] ${kind} insights handoff rejected: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn(`[content-map] ${kind} insights handoff failed:`, (err as Error).message);
    return false;
  }
}

/**
 * Hand the job off after the response. When it can't be handed off (local dev,
 * scripts, tests), run it here with `fallback`.
 */
export function handOffInsights(kind: InsightsKind, id: string, fallback: () => void, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): void {
  const job = async () => {
    if (!(await sendInsightsJob(kind, id, deps))) fallback();
  };
  try {
    after(job);
  } catch {
    void job();
  }
}
