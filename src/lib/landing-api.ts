import crypto from "crypto";
import net from "net";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Shared helpers for the landing manifest and ingestion routes.
 *
 * Trust model: `property_key` is public and proves nothing. Authority comes from
 * (a) the request Origin matching the property's allowlist and (b) an HMAC
 * assignment token this server minted. Everything a landing page sends is
 * treated as hostile and is re-derived, bounded, or dropped here.
 */

export const LANDING_SCHEMA_VERSION = 1;
export const MAX_EVENTS_PER_BATCH = 40;
export const MAX_BODY_BYTES = 64 * 1024;
/** Reject events dated further ahead than this (clock skew tolerance). */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
/** Reject events older than this; the SDK retries within a session, not for days. */
export const MAX_EVENT_AGE_MS = 72 * 60 * 60 * 1000;

export const LANDING_EVENT_TYPES = [
  "page_view",
  "section_view",
  "section_engaged",
  "cta_click",
  "form_start",
  "form_step",
  "form_error",
  "form_submit",
  "booking_open",
  "booking_complete",
  "scroll_depth",
  "section_dwell",
  // Whole-page time, emitted once per page view when the tab is hidden or
  // unloaded. Sessions recorded before this existed have none, which the report
  // must show as "not measured" rather than zero.
  "page_dwell",
  /* HubSpot chat, reported by the widget's own event API because it renders in
     a cross-origin iframe that page listeners cannot see into. `chat_start` is a
     conversation actually begun, not the bubble being opened; `chat_identified`
     is HubSpot associating the visitor with a CRM contact, which is what it does
     once the chat has captured an email. */
  "chat_start",
  "chat_identified",
] as const;

export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number];

/** Google Ads ValueTrack plus UTM values the contract permits. Anything else is dropped. */
export const ATTRIBUTION_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "ad_group_id",
  "creative_id",
  "keyword",
  "match_type",
  "network",
  "placement",
  "device",
] as const;

const PROPERTY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const CONTENT_FIELD_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

/**
 * Signing secret for assignment tokens. Absent secret means the routes refuse
 * to serve rather than falling back to an unsigned mode — failing closed keeps a
 * misconfigured deploy from accepting forged assignments.
 */
export function getSigningSecret(): string | null {
  const secret = process.env.LANDING_TOKEN_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

/** Exact-match origin check. No wildcard, no suffix matching, no `null` origin. */
export function resolveAllowedOrigin(
  req: NextRequest,
  allowedOrigins: string[]
): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
}

/**
 * Client IP for exclusion matching only — compared, then discarded. Nothing in
 * this module or the ingest route persists the value; landing events store no
 * IP by design.
 *
 * Only the leftmost `x-forwarded-for` entry is read, because that is the one the
 * platform edge sets from the real connection. Every later entry is attacker
 * controlled: a client can send its own `x-forwarded-for` and the edge appends
 * to it, so trusting the rightmost or the whole chain would let anyone
 * impersonate an excluded internal address (or, worse, an included one).
 *
 * Returns null on anything missing or unparseable, which makes the caller fail
 * open and record the event. Dropping real events on a header quirk is the
 * worse failure here: exclusion is a reporting convenience, not a security
 * control.
 */
export function clientIpFromRequest(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;

  let candidate = forwarded.split(",", 1)[0].trim();
  // Longest possible textual IP is an IPv4-mapped IPv6 address (45 chars).
  if (!candidate || candidate.length > 64) return null;

  // Some proxies append a port: "[2001:db8::1]:443" or "203.0.113.7:443".
  const bracketed = candidate.match(/^\[([^\]]+)\]/);
  if (bracketed) candidate = bracketed[1];
  else if (candidate.split(":").length === 2) candidate = candidate.split(":")[0];

  return net.isIP(candidate) ? candidate : null;
}

/**
 * True when `ip` falls inside one of the property's exclusion entries, each an
 * exact address or a CIDR range, IPv4 or IPv6.
 *
 * Fails open in every ambiguous case: no IP, an unparseable IP, or a list with
 * no usable entry all return false, so the event is recorded.
 */
export function isExcludedIp(ip: string | null, patterns: string[]): boolean {
  if (!ip) return false;
  const family = net.isIP(ip);
  if (!family) return false;

  const blocked = new net.BlockList();
  let usable = 0;

  for (const raw of patterns) {
    if (typeof raw !== "string") continue;
    const entry = raw.trim();
    if (!entry || entry.length > 64) continue;

    const [address, prefix] = entry.split("/");
    const entryFamily = net.isIP(address);
    if (!entryFamily) continue;
    const type = entryFamily === 6 ? "ipv6" : "ipv4";

    try {
      if (prefix === undefined) {
        blocked.addAddress(address, type);
      } else {
        // Digits only: an empty or non-numeric prefix must not coerce to /0,
        // which would silently exclude every visitor.
        if (!/^\d{1,3}$/.test(prefix)) continue;
        const bits = Number(prefix);
        if (bits > (entryFamily === 6 ? 128 : 32)) continue;
        blocked.addSubnet(address, bits, type);
      }
      usable += 1;
    } catch {
      // A malformed entry excludes nothing rather than everything.
    }
  }

  if (usable === 0) return false;
  return blocked.check(ip, family === 6 ? "ipv6" : "ipv4");
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
    "cache-control": "no-store",
  };
}

export function isValidPropertyKey(value: unknown): value is string {
  return typeof value === "string" && PROPERTY_KEY_PATTERN.test(value);
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

export function isContentFieldKey(value: unknown): value is string {
  return typeof value === "string" && CONTENT_FIELD_PATTERN.test(value);
}

/** Bound a string and strip control characters before it reaches storage. */
export function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

export interface AssignmentTokenPayload {
  propertyKey: string;
  experimentId: string;
  allocationVersion: string;
  issuedAt: number;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint an assignment token binding an event batch to the experiment context this
 * server actually served. The token carries no visitor identity.
 */
export function signAssignmentToken(payload: AssignmentTokenPayload, secret: string): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${signature}`;
}

/**
 * Verify and decode an assignment token. Uses a timing-safe comparison and
 * rejects anything expired, malformed, or bound to a different property.
 */
export function verifyAssignmentToken(
  token: unknown,
  secret: string,
  expectedPropertyKey: string
): AssignmentTokenPayload | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.propertyKey !== expectedPropertyKey) return null;
  if (!isSlug(candidate.experimentId) || typeof candidate.allocationVersion !== "string") return null;
  if (typeof candidate.issuedAt !== "number") return null;
  if (Date.now() - candidate.issuedAt > TOKEN_TTL_MS) return null;

  return {
    propertyKey: candidate.propertyKey,
    experimentId: candidate.experimentId,
    allocationVersion: candidate.allocationVersion,
    issuedAt: candidate.issuedAt,
  };
}

/**
 * Keep only allowlisted attribution keys, each bounded. Google Ads IDs are
 * numeric; free-form keyword text is length-capped.
 */
export function sanitiseAttribution(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = boundedString(source[key], 120);
    if (value) output[key] = value;
  }
  return output;
}

/**
 * Event properties must be bounded scalars. Objects, arrays and long strings are
 * dropped — this is the barrier that stops form values or free text being
 * smuggled into the analytics store.
 */
export function sanitiseProperties(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const output: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [key, value] of Object.entries(source)) {
    if (count >= 20) break;
    if (!CONTENT_FIELD_PATTERN.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = value;
      count += 1;
    } else if (typeof value === "boolean") {
      output[key] = value;
      count += 1;
    } else if (typeof value === "string") {
      const bounded = boundedString(value, 120);
      if (bounded) {
        output[key] = bounded;
        count += 1;
      }
    }
  }
  return output;
}

/** Parse an ISO timestamp, rejecting values outside the accepted freshness window. */
export function parseEventTimestamp(value: unknown, now: number): Date | null {
  const raw = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  if (raw - now > MAX_FUTURE_SKEW_MS) return null;
  if (now - raw > MAX_EVENT_AGE_MS) return null;
  return new Date(raw);
}

/** Read a JSON body with a hard byte cap, so an oversized payload cannot be buffered. */
export async function readBoundedJson(req: NextRequest): Promise<unknown | null> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
