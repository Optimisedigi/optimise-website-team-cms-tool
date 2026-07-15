/**
 * Bridges internal time-entry users to contractor records.
 *
 * Time entries logged through the admin grid carry a `user` relationship (the
 * person the hours belong to) but usually leave `contractor` empty. Contractor
 * costs and fortnightly payments key on `contractor`, so those user-logged
 * entries would never build a payment. This helper resolves a contractor for
 * such entries by matching the user to a contractor on email first, then on a
 * normalised name — the same identity the admin sees in both surfaces.
 */

export type ContractorLike = { id: number | string; name?: string | null; email?: string | null };
export type UserLike = { id: number | string; name?: string | null; email?: string | null };

export function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when a user and contractor represent the same person (email, else name). */
export function userMatchesContractor(user: UserLike, contractor: ContractorLike): boolean {
  const userEmail = String(user.email ?? "").trim().toLowerCase();
  const contractorEmail = String(contractor.email ?? "").trim().toLowerCase();
  if (userEmail && contractorEmail && userEmail === contractorEmail) return true;

  const userName = normalizeName(user.name);
  const contractorName = normalizeName(contractor.name);
  return Boolean(userName) && userName === contractorName;
}

/** Map of userId (string) → contractorId for every user that matches a contractor. */
export function buildUserToContractorMap(
  contractors: ContractorLike[],
  users: UserLike[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const user of users) {
    const match = contractors.find((contractor) => userMatchesContractor(user, contractor));
    if (match) map.set(String(user.id), String(match.id));
  }
  return map;
}

function relId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    return id == null ? undefined : String(id);
  }
  return String(value);
}

/**
 * Resolve which contractor a time entry belongs to: its explicit `contractor`
 * relationship when set, otherwise the contractor its `user` maps to.
 */
export function resolveEntryContractorId(
  entry: { contractor?: unknown; user?: unknown },
  userToContractor: Map<string, string>,
): string | undefined {
  const explicit = relId(entry.contractor);
  if (explicit) return explicit;
  const userId = relId(entry.user);
  if (userId && userToContractor.has(userId)) return userToContractor.get(userId);
  return undefined;
}
