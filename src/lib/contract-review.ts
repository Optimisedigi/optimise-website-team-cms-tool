/**
 * Draft contract review: a token link the account manager (the client's
 * day-to-day contact, not necessarily the signatory) uses to read a draft and
 * leave inline comments. Pure helpers shared by the review API routes, the
 * public review page and the CMS panel.
 */
/** How long a draft review link stays valid after it is created. */
export const REVIEW_LINK_TTL_DAYS = 30;

/** Input caps for the public comment endpoint. */
export const REVIEW_COMMENT_MAX_LENGTH = 4000;
export const REVIEW_QUOTE_MAX_LENGTH = 1000;
export const REVIEW_SECTION_MAX_LENGTH = 120;
/** Hard ceiling per contract, so a leaked link can't flood the CMS or inbox. */
export const REVIEW_MAX_COMMENTS_PER_CONTRACT = 200;

/** Fallback when a contract has no Agency Contact email. */
export const DEFAULT_AGENCY_CONTACT_EMAIL = "peter@optimisedigital.online";

/** Cheap shape check before any database lookup. */
export function isWellFormedReviewToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

export function reviewLinkExpiresAt(now: Date): Date {
  return new Date(now.getTime() + REVIEW_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type ReviewableContract = {
  status?: string | null;
  deletedAt?: string | null;
  isTemplate?: boolean | null;
  reviewToken?: string | null;
  reviewTokenExpiresAt?: string | null;
};

export type ReviewAccess =
  | { ok: true }
  | { ok: false; status: 404 | 410; code: "not_found" | "expired" | "not_draft"; error: string };

/**
 * Whether a contract found by its review token may be viewed and commented on.
 * Review is only open while the contract is a live draft and the link is in date.
 */
export function checkReviewAccess(doc: ReviewableContract | null | undefined, now: Date): ReviewAccess {
  if (!doc || !doc.reviewToken || doc.deletedAt || doc.isTemplate) {
    return { ok: false, status: 404, code: "not_found", error: "This review link isn't valid." };
  }
  const expires = doc.reviewTokenExpiresAt ? new Date(doc.reviewTokenExpiresAt) : null;
  if (!expires || Number.isNaN(expires.getTime()) || expires < now) {
    return {
      ok: false,
      status: 410,
      code: "expired",
      error: "This review link has expired. Please ask your Optimise Digital contact for a new one.",
    };
  }
  if (doc.status !== "draft") {
    return {
      ok: false,
      status: 410,
      code: "not_draft",
      error: "This draft is no longer open for review. Your Optimise Digital contact will be in touch.",
    };
  }
  return { ok: true };
}

export type ReviewCommentInput = {
  quote: string;
  occurrence: number;
  section: string;
  comment: string;
};

export type ValidatedComment = { ok: true; value: ReviewCommentInput } | { ok: false; error: string };

/** Validate and normalise an untrusted comment body from the public review page. */
export function validateReviewComment(body: unknown): ValidatedComment {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const raw = body as Record<string, unknown>;

  const quote = typeof raw.quote === "string" ? raw.quote.trim() : "";
  const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
  const section = typeof raw.section === "string" ? raw.section.trim().slice(0, REVIEW_SECTION_MAX_LENGTH) : "";
  const occurrence = typeof raw.occurrence === "number" && Number.isInteger(raw.occurrence) ? raw.occurrence : 0;

  if (!quote) return { ok: false, error: "Select some text to comment on." };
  if (quote.length > REVIEW_QUOTE_MAX_LENGTH) {
    return { ok: false, error: `Please select a shorter passage (under ${REVIEW_QUOTE_MAX_LENGTH} characters).` };
  }
  if (!comment) return { ok: false, error: "Please write a comment." };
  if (comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Please keep comments under ${REVIEW_COMMENT_MAX_LENGTH} characters.` };
  }
  if (occurrence < 0 || occurrence > 10_000) return { ok: false, error: "Invalid request." };

  return { ok: true, value: { quote, occurrence, section, comment } };
}

/** Public comment shape returned to the review page (no internal fields). */
export type PublicReviewComment = {
  id: string;
  quote: string;
  occurrence: number;
  section: string;
  comment: string;
  createdAt: string;
  sent: boolean;
};

export function toPublicReviewComment(doc: Record<string, unknown>): PublicReviewComment {
  return {
    id: String(doc.id),
    quote: String(doc.quote ?? ""),
    occurrence: typeof doc.occurrence === "number" ? doc.occurrence : 0,
    section: String(doc.section ?? ""),
    comment: String(doc.comment ?? ""),
    createdAt: String(doc.createdAt ?? ""),
    sent: Boolean(doc.emailedAt),
  };
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3004")
  );
}

export function reviewUrlFor(token: string): string {
  return `${appBaseUrl()}/contracts/review/${token}`;
}

export function contractAdminUrlFor(id: string | number): string {
  return `${appBaseUrl()}/admin/collections/contracts/${encodeURIComponent(String(id))}`;
}

export function contractEmailSender(): { name: string; email: string } {
  return {
    name: "Optimise Digital",
    email: process.env.CONTRACT_FROM_EMAIL || "contracts@optimisedigital.online",
  };
}
