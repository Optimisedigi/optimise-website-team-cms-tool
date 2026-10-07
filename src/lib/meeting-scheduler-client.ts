/**
 * A meeting scheduler's `client` field can point at a signed client or at a
 * prospect (Client Proposal). Activity-log and notification records only
 * relate to the `clients` collection, so they need the client ID — and nothing
 * at all when the meeting is with a prospect.
 */
export function meetingSchedulerClientId(value: unknown): string | number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { relationTo, value: related } = value as { relationTo?: unknown; value?: unknown };
  if (relationTo !== "clients") return undefined;
  if (typeof related === "string" || typeof related === "number") return related;
  if (related && typeof related === "object") {
    const id = (related as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return undefined;
}
