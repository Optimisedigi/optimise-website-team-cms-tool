import crypto from "crypto";

/**
 * Check if the request has a valid API key via the x-api-key header.
 * Used to allow the growth tools server to read/create audit data.
 */
export function hasValidApiKey(req: any): boolean {
  const apiKey =
    req.headers.get?.("x-api-key") || (req.headers as any)?.["x-api-key"];
  if (!apiKey || !process.env.AUDIT_API_KEY) return false;
  const expected = Buffer.from(process.env.AUDIT_API_KEY);
  const provided = Buffer.from(String(apiKey));
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
