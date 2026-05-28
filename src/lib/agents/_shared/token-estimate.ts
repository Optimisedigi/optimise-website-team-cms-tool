/**
 * Heuristic token estimator.
 *
 * Deliberately dependency-free: a real BPE tokenizer (tiktoken/gpt-tokenizer)
 * would be exact but heavy (~MBs) and the goal here is only to give the team a
 * rough, always-available sense of how much the agent's memory + soul add to
 * every prompt so they keep those entries succinct.
 *
 * The ~4-chars-per-token ratio is the standard rule of thumb for English-ish
 * prose and matches how lightweight agent harnesses estimate context size.
 * Always rendered with a leading "≈" so nobody mistakes it for an exact count.
 */

const CHARS_PER_TOKEN = 4;

/** Estimate the number of tokens in a string. Returns 0 for empty/nullish. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Format an estimated token count for display, e.g. "≈120 tokens". */
export function formatTokens(n: number): string {
  const safe = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  return `≈${safe.toLocaleString("en-US")} ${safe === 1 ? "token" : "tokens"}`;
}
