/**
 * Deterministic copy variation for OptiMate Google Ads report emails.
 *
 * When a weekly or monthly report is drafted for several accounts in one run,
 * every draft used to carry byte-identical prose. These helpers pick a phrasing
 * variant from a seed (client + reporting period), so each account reads
 * differently while the same account + period always reproduces the same copy.
 * Numbers and facts are never varied - only the wording around them.
 */

/**
 * Normalises a Google Ads customer id for seeding.
 *
 * The individual chat context carries `1840834992` while portfolio account
 * records carry `184-083-4992`. Seeding on the raw value gives the same account
 * a different seed depending on which surface drafted the email, so the copy
 * diverges between surfaces. Stripping to digits keeps one account's wording
 * identical everywhere, while different accounts still read differently.
 */
export function seedCustomerId(customerId: unknown): string {
  return typeof customerId === "string" || typeof customerId === "number"
    ? String(customerId).replace(/\D/g, "")
    : "";
}

/** FNV-1a 32-bit hash over the joined seed parts. */
export function copySeed(...parts: Array<string | number | null | undefined>): number {
  const input = parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Mixes a named slot into a seed so different sentences vary independently.
 *
 * The murmur3-style finaliser matters: plain FNV-1a leaves the low bits highly
 * correlated between slots, so every 4-variant list would resolve to the same
 * index and whole drafts would still repeat across accounts.
 */
function slotSeed(seed: number, slot: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < slot.length; i += 1) {
    hash ^= slot.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Picks one variant for the given seed + slot. The tuple type keeps the list non-empty. */
export function pickVariant<T>(variants: readonly [T, ...T[]], seed: number, slot: string): T {
  const index = slotSeed(seed, slot) % variants.length;
  return variants[index]!;
}

export const GREETING_VARIANTS = [
  "Hey team,",
  "Hi team,",
  "Hey all,",
  "Hi all,",
  "Morning team,",
] as const;

/** Greeting line, varied per account so batched drafts do not open identically. */
export function pickGreeting(seed: number): string {
  return pickVariant(GREETING_VARIANTS, seed, "greeting");
}
