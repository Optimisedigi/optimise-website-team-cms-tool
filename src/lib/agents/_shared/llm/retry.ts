/**
 * Error classification + exponential backoff helper for LLM provider calls.
 *
 * Distinguishes between errors the agent loop should retry on (transient
 * network blips, 429/529 overloads), errors that should trigger a credential
 * fallback (401/403 from OAuth), and errors that should abort immediately
 * (invalid request, context overflow).
 */

export type ErrorClass =
  | "overloaded"        // 429 / 529 ,  retry with backoff
  | "rate-limited"      // OpenAI-style 429 ,  retry with backoff
  | "transient"         // 502 / 503 / network blip ,  retry small N
  | "auth"              // 401 / 403 ,  non-retryable; resolver layer escalates to fallback
  | "context-overflow"  // model token cap ,  non-retryable, escalate to caller
  | "invalid-request"   // 400 ,  non-retryable, log and raise
  | "unknown";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}: ${bodyText.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof HttpError) {
    if (err.status === 429) return "rate-limited";
    if (err.status === 529) return "overloaded";
    if (err.status === 401 || err.status === 403) return "auth";
    if (err.status === 400) {
      // Heuristic: Anthropic returns 400 for context overflow with a "context"
      // mention in the body; OpenAI returns "context_length_exceeded".
      if (/context|max.?tokens|too.?long|prompt.*length/i.test(err.bodyText)) {
        return "context-overflow";
      }
      return "invalid-request";
    }
    if (err.status >= 500 && err.status < 600) return "transient";
    return "unknown";
  }
  // Network errors from fetch surface as TypeErrors with various messages
  if (err instanceof TypeError && /fetch|network|ECONNRESET|ETIMEDOUT/i.test(err.message)) {
    return "transient";
  }
  return "unknown";
}

export function isRetryable(cls: ErrorClass): boolean {
  return cls === "overloaded" || cls === "rate-limited" || cls === "transient";
}

/** Sleep with optional AbortSignal support. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("Aborted"));
      }, { once: true });
    }
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number; signal?: AbortSignal },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const cls = classifyError(err);
      if (!isRetryable(cls) || attempt === maxAttempts) throw err;
      const jitter = Math.random() * 250;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(delay, opts?.signal);
    }
  }
  throw lastErr;
}
