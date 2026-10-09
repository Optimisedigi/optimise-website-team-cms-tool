/**
 * Resolves the "Target customer" line OptiMate adds to each chat message.
 *
 * Priority order (first non-blank wins):
 *   1. Business tab `clients.targetCustomer`
 *   2. Newest Discovery Briefing `data.idealClient` for the client
 *   3. Google Ads triage `clients.gadsAuto.triageIdealCustomer`
 *
 * Pure functions only; no Payload imports. Length is not truncated here —
 * OptiMate cuts the line to roughly 280 characters itself.
 */

function normalise(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

export function resolveTargetCustomer({
  businessTab,
  discoveryBriefing,
  googleAdsTriage,
}: {
  businessTab?: unknown;
  discoveryBriefing?: unknown;
  googleAdsTriage?: unknown;
}): string | null {
  return normalise(businessTab) ?? normalise(discoveryBriefing) ?? normalise(googleAdsTriage);
}

function relationId(client: unknown): string | null {
  if (typeof client === "number" || typeof client === "string") {
    const id = String(client).trim();
    return id.length > 0 ? id : null;
  }
  if (client && typeof client === "object" && "id" in client) {
    return relationId((client as { id?: unknown }).id);
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps client id → newest non-blank `data.idealClient`.
 * `briefings` must be sorted newest first (e.g. `sort: "-updatedAt"`). Older
 * briefings fill in when newer ones have no answer.
 */
export function latestIdealClientByClient(
  briefings: Array<{ client?: unknown; data?: unknown }>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const briefing of briefings) {
    const clientId = relationId(briefing.client);
    if (!clientId || result.has(clientId)) continue;
    if (!isPlainObject(briefing.data)) continue;
    const idealClient = normalise(briefing.data.idealClient);
    if (idealClient) result.set(clientId, idealClient);
  }
  return result;
}
