/**
 * Shared Brevo (Sendinblue) transactional email sender.
 *
 * Brevo is the agency's internal email service. Routes across contracts,
 * invoice statements and meeting schedulers all POST to the same
 * `https://api.brevo.com/v3/smtp/email` endpoint with the `api-key` header.
 * This helper centralises that call so new features (e.g. the SEO migration
 * 30-day review) use the same provider, sender defaults and error handling.
 */

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface SendBrevoEmailInput {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  cc?: BrevoRecipient[];
  sender?: { name: string; email: string };
}

export interface SendBrevoEmailResult {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  messageId?: string;
}

/**
 * Default sender. Mirrors the contract/invoice routes, which fall back to
 * `CONTRACT_FROM_EMAIL` and the "Optimise Digital" display name.
 */
export function defaultBrevoSender(): { name: string; email: string } {
  return {
    name: "Optimise Digital",
    email: process.env.CONTRACT_FROM_EMAIL || "reports@optimisedigital.online",
  };
}

/**
 * Send a transactional email through Brevo.
 *
 * Never throws — a missing key, network error, or non-2xx Brevo response all
 * resolve to `{ ok: false, ... }` so callers (cron sweeps, manual buttons)
 * can decide how to surface the failure without try/catch noise.
 */
export async function sendBrevoEmail(input: SendBrevoEmailInput): Promise<SendBrevoEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { ok: false, code: "no-api-key", message: "BREVO_API_KEY not configured" };
  }
  if (!input.to.length) {
    return { ok: false, code: "no-recipients", message: "No recipients provided" };
  }

  const sender = input.sender || defaultBrevoSender();

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: input.to,
        ...(input.cc && input.cc.length > 0 && { cc: input.cc }),
        subject: input.subject,
        htmlContent: input.htmlContent,
        ...(input.textContent && { textContent: input.textContent }),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      let code: string | undefined;
      let message: string | undefined;
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string };
        code = parsed.code;
        message = parsed.message;
      } catch {
        message = text.slice(0, 300);
      }
      console.error(`[brevo] Send email API error (${res.status}):`, code, message);
      return { ok: false, status: res.status, code, message };
    }

    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, status: res.status, messageId: body.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brevo send failed";
    console.error("[brevo] Send email failed:", message);
    return { ok: false, code: "network-error", message };
  }
}
