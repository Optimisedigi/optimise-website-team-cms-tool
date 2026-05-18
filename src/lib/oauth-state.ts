import crypto from "node:crypto";

/**
 * Signed OAuth `state` helpers (BP-007 mitigation).
 *
 * The bare-id form of `state` (just a row PK) let any attacker construct an
 * OAuth URL with `state=<victim-row-id>`, complete consent with their own
 * Google account, and have the callback rebind their tokens onto the target
 * row \u2014 falsifying analytics in client reports.
 *
 * The fix: every connect route signs `nonce:targetId:initiatorUserId` with
 * PAYLOAD_SECRET (HMAC-SHA256). The callback re-derives the signature with
 * a constant-time compare, then cross-checks the nonce against an httpOnly
 * cookie and verifies the current admin session matches `initiatorUserId`.
 *
 * Existing GSC/GA4/Gmail "Connect" buttons will need to be clicked once
 * after the rollout \u2014 old unsigned `state=<id>` URLs no longer validate.
 */

function getSecret(): string {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    throw new Error(
      "PAYLOAD_SECRET is not configured; cannot sign OAuth state",
    );
  }
  return secret;
}

/**
 * Cookie name conventions per flow. The nonce stored under this cookie must
 * match the nonce embedded in the signed `state` returned from Google.
 */
export const OAUTH_NONCE_COOKIE = {
  gsc: "oauth_nonce_gsc",
  ga4: "oauth_nonce_ga4",
  gmail: "oauth_nonce_gmail",
} as const;

export type OAuthFlow = keyof typeof OAUTH_NONCE_COOKIE;

export interface SignedOAuthState {
  /** The `state` value to ship to Google. */
  state: string;
  /** The nonce to set as an httpOnly cookie on the response. */
  nonce: string;
}

/**
 * Build a signed OAuth state binding `targetId` (clientId or userId) and the
 * `initiatorUserId` (the admin who clicked Connect) to a freshly-generated
 * nonce. Returns both pieces so the connect route can set the cookie alongside
 * the redirect.
 */
export function signOAuthState(
  targetId: string | number,
  initiatorUserId: string | number,
): SignedOAuthState {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${nonce}:${targetId}:${initiatorUserId}`;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  return { state: `${payload}.${sig}`, nonce };
}

export type VerifiedOAuthState =
  | {
      ok: true;
      nonce: string;
      targetId: string;
      initiatorUserId: string;
    }
  | {
      ok: false;
      reason:
        | "malformed_state"
        | "invalid_state_signature";
    };

/**
 * Verify the signature on a callback's `state` parameter. Nonce-cookie and
 * initiator-session checks happen in the route (they need request context).
 */
export function verifyOAuthState(stateRaw: string | null): VerifiedOAuthState {
  if (!stateRaw) return { ok: false, reason: "malformed_state" };

  const dotIdx = stateRaw.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === stateRaw.length - 1) {
    return { ok: false, reason: "malformed_state" };
  }

  const payload = stateRaw.slice(0, dotIdx);
  const sig = stateRaw.slice(dotIdx + 1);

  const parts = payload.split(":");
  if (parts.length !== 3) return { ok: false, reason: "malformed_state" };
  const [nonce, targetId, initiatorUserId] = parts;
  if (!nonce || !targetId || !initiatorUserId) {
    return { ok: false, reason: "malformed_state" };
  }

  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expectedSig, "hex");
  if (
    sigBuf.length === 0 ||
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return { ok: false, reason: "invalid_state_signature" };
  }

  return { ok: true, nonce, targetId, initiatorUserId };
}
