/**
 * Auth event log. Records OAuth success / failure / refresh / fallback
 * transitions so they're visible in three surfaces:
 *   1. The chat status pill (most recent event for the active model)
 *   2. The /admin/agent-auth admin page (per-provider state, last failure, etc.)
 *   3. The activity-log collection (audit trail)
 *
 * Every transition the user might want to know about goes through here.
 * Successful OAuth use is recorded but is the no-news case; failures and
 * provider failover are the loud cases the UI flags.
 */

import { getPayload } from "payload";
import config from "@/payload.config";
import type { ProviderName } from "../registry";

export type AuthEventKind =
  | "oauth-success"          // OAuth credential used to serve a request
  | "oauth-failed"           // OAuth refresh/use threw; agent loop will fall to next provider
  | "oauth-connected"        // User completed the consent flow
  | "oauth-disconnected"     // User force-fallback toggled on, or revoked
  | "provider-failover"      // Agent loop walked from one model to another mid-run
  | "credential-missing";    // Resolver had nothing to return for a provider

export interface AuthEventInput {
  provider: ProviderName;
  kind: AuthEventKind;
  message: string;
  /** Optional context: agent run id, agent name, model that was attempted. */
  agentRunId?: string;
  agentName?: string;
  modelAttempted?: string;
  modelServed?: string;
}

export interface AuthEvent extends AuthEventInput {
  id: string;
  timestamp: string;
}

/**
 * Record an event into the activity-log collection. We reuse the existing
 * activity-log rather than introducing a dedicated collection so the events
 * stream alongside agent steps and other system events.
 */
export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });
    await payload.create({
      collection: "activity-log",
      data: {
        type: "agent_auth_event",
        title: `[auth] ${input.provider}: ${input.kind}`,
        description: input.message.slice(0, 500),
        agentRunId: input.agentRunId,
        agentName: input.agentName,
        toolName: input.modelAttempted,
        output: {
          provider: input.provider,
          kind: input.kind,
          message: input.message,
          modelAttempted: input.modelAttempted,
          modelServed: input.modelServed,
        },
        source: input.kind === "oauth-success" ? "oauth" : undefined,
      } as any,
      overrideAccess: true,
    });
  } catch (err) {
    // Logging is best-effort; never let a logging failure break a call.
    console.error("[auth-events] Failed to record event:", err);
  }
}

/**
 * Get the most recent auth event(s) for a provider. Used by the agent-auth
 * status page and the chat status pill.
 */
export async function getRecentAuthEvents(opts: {
  provider?: ProviderName;
  kinds?: AuthEventKind[];
  limit?: number;
}): Promise<AuthEvent[]> {
  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });
    const where: Record<string, unknown> = { type: { equals: "agent_auth_event" } };
    const result = await payload.find({
      collection: "activity-log",
      where: where as any,
      limit: opts.limit ?? 20,
      sort: "-createdAt",
      overrideAccess: true,
    });
    const filtered = (result.docs as Array<any>)
      .map((doc) => ({
        id: String(doc.id),
        provider: doc.output?.provider as ProviderName,
        kind: doc.output?.kind as AuthEventKind,
        message: doc.output?.message ?? doc.description ?? "",
        agentRunId: doc.agentRunId,
        agentName: doc.agentName,
        modelAttempted: doc.output?.modelAttempted,
        modelServed: doc.output?.modelServed,
        timestamp: doc.createdAt as string,
      }))
      .filter((ev) => {
        if (opts.provider && ev.provider !== opts.provider) return false;
        if (opts.kinds && opts.kinds.length > 0 && !opts.kinds.includes(ev.kind)) return false;
        return true;
      });
    return filtered;
  } catch (err) {
    console.error("[auth-events] Failed to read events:", err);
    return [];
  }
}

/**
 * Find the most recent oauth-failed event for a provider. Used by the
 * /admin/agent-auth status panel to show "Last failure: 3 minutes ago".
 */
export async function getLastFailure(provider: ProviderName): Promise<AuthEvent | null> {
  const events = await getRecentAuthEvents({
    provider,
    kinds: ["oauth-failed"],
    limit: 1,
  });
  return events[0] ?? null;
}
