/**
 * Test-swarm auth helper.
 *
 * Single source of truth for authenticating against the local dev server
 * (http://localhost:3004) during end-to-end / platform test runs.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Admin (CMS) auth
 * ──────────────────────────────────────────────────────────────────────
 * Payload v3 exposes a REST login on every auth-enabled collection at
 * `POST /api/<slug>/login`. The admin user lives in the `users` collection
 * (see `src/collections/Users.ts`, `auth: { ... }`), so the endpoint is:
 *
 *     POST /api/users/login   body: { email, password }
 *
 * On success Payload responds 200 with `{ user, token, exp }` and sets an
 * httpOnly `payload-token` cookie via `Set-Cookie`. We capture that cookie
 * and replay it on subsequent authenticated requests.
 *
 * Credentials come from the environment ONLY — never hardcode the password:
 *   - TEST_ADMIN_EMAIL    (default: peter@optimisedigital.online)
 *   - TEST_ADMIN_PASSWORD (required, no default)
 *
 * ──────────────────────────────────────────────────────────────────────
 * Public surfaces — how each is gated and where its token comes from
 * ──────────────────────────────────────────────────────────────────────
 * These are NOT CMS-session protected. Each public surface has its own
 * gate, validated by a dedicated route handler. Tokens/PINs are read from
 * the fixture records (see `scripts/test-fixtures.ts`), not from env.
 *
 * 1. Client dashboard (google-dashboard)
 *      Gate:   4-digit `clients.clientPin`.
 *      Verify: POST /api/dashboard/verify  body: { slug, pin }
 *      On success sets an HMAC-signed cookie (validated by
 *      `validateDashboardToken`). Slug = the client slug.
 *
 * 2. Client hub
 *      Gate:   4-digit `clients.clientPin`.
 *      Verify: POST /api/client-hub/verify body: { pin }
 *      Data:   GET /api/client-hub/[slug] — PIN passed per-request via the
 *              `x-client-pin` header OR `?pin=` query param (see
 *              `pinFromRequest` in `src/lib/client-hub-auth.ts`).
 *
 * 3. Audits / proposals / presentation decks
 *      Gate:   4-digit PIN — `client_proposals.proposalPin`, or
 *              `clients.clientPin` for client-presentation decks.
 *      Verify: POST /api/audit-auth body: { slug, password }
 *              (slug may be `<clientSlug>/<deckSlug>` for partner decks).
 *
 * 4. Discovery briefings
 *      Gate:   4-digit PIN — `clients.clientPin` (scope "client") or
 *              `client_proposals.proposalPin` (scope "proposal", falling
 *              back to the linked client's clientPin).
 *      Verify: POST /api/discovery-auth
 *              body: { scope: "client"|"proposal", slug, briefingId, password }
 *      Only enforced when the briefing's `requirePin` toggle is on.
 *
 * 5. Contractor portal
 *      Gate:   opaque `contractors.portalToken` (≥16 chars), in the URL path.
 *      Access: GET/POST /api/contractor/[token]
 *      No PIN — possession of the token is the credential.
 *
 * 6. Meeting scheduler
 *      Gate:   per-attendee `meeting-schedulers.attendees[].token`, in path.
 *      Access: /api/meeting-schedulers/respond/[token]
 *      Each attendee has a distinct token; possession is the credential.
 *
 * 7. Contract signing — SKIPPED per test policy.
 *      Contracts use per-recipient signing tokens. Per
 *      `docs/test-runs/README.md` §4, the contract flow is NOT exercised
 *      during testing. Do not call contract endpoints from the harness.
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3004";
const DEFAULT_ADMIN_EMAIL = "peter@optimisedigital.online";

export interface LoginResult {
  /** Full cookie string suitable for a `Cookie` request header. */
  cookie: string;
  /** The raw `payload-token` JWT value. */
  token: string;
}

/**
 * Session cookie captured by the most recent `loginAdmin()` call. Used as
 * the default credential by `authedFetch`. Module-scoped so the harness can
 * `loginAdmin()` once and then call `authedFetch(path, init)` everywhere.
 */
let sessionCookie: string | null = null;

/**
 * Authenticate as the CMS admin and return the session cookie.
 *
 * Reads TEST_ADMIN_EMAIL (default peter@optimisedigital.online) and
 * TEST_ADMIN_PASSWORD from the environment. Throws if the password is
 * unset or the login fails — credentials are NEVER hardcoded.
 */
export async function loginAdmin(): Promise<LoginResult> {
  const email = process.env.TEST_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      "TEST_ADMIN_PASSWORD is not set. Export it in your shell before running the harness — it must never be committed.",
    );
  }

  const res = await fetch(`${BASE_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Admin login failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
    );
  }

  const token = extractPayloadToken(res.headers);
  if (!token) {
    throw new Error(
      "Admin login succeeded but no `payload-token` cookie was returned.",
    );
  }

  sessionCookie = `payload-token=${token}`;
  return { cookie: sessionCookie, token };
}

/** The cookie from the most recent `loginAdmin()`, or null if not logged in. */
export function getSessionCookie(): string | null {
  return sessionCookie;
}

/**
 * Extract the `payload-token` value from a response's Set-Cookie header(s).
 * Uses `getSetCookie()` when available (Node 18.14+/undici) and falls back
 * to the combined `set-cookie` header otherwise.
 */
function extractPayloadToken(headers: Headers): string | null {
  const cookieStrings: string[] =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie ===
    "function"
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : (headers.get("set-cookie")?.split(/,(?=[^;]+?=)/) ?? []);

  for (const cookieStr of cookieStrings) {
    const match = /(?:^|;\s*)payload-token=([^;]+)/.exec(cookieStr);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Fetch wrapper that resolves `path` against the dev-server base URL and
 * attaches the admin session cookie captured by `loginAdmin()`. `path` may
 * be an absolute URL (used as-is) or a path beginning with `/`.
 *
 * Call `loginAdmin()` once first; this then reuses that session. Throws if
 * no session is established yet.
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!sessionCookie) {
    throw new Error(
      "authedFetch called before loginAdmin(). Call loginAdmin() to establish a session first.",
    );
  }

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  const headers = new Headers(init.headers);
  const existingCookie = headers.get("cookie");
  headers.set(
    "cookie",
    existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie,
  );

  return fetch(url, { ...init, headers });
}

export { BASE_URL };
