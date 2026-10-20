import { describe, expect, it } from "vitest";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_QUOTE_MAX_LENGTH,
  checkReviewAccess,
  isWellFormedReviewToken,
  reviewLinkExpiresAt,
  validateReviewComment,
} from "@/lib/contract-review";
import { anchorFromRange, rangeFromAnchor } from "@/lib/contract-review-anchor";

const NOW = new Date("2026-10-20T00:00:00.000Z");
const TOKEN = "a".repeat(64);

function draft(overrides: Record<string, unknown> = {}) {
  return {
    status: "draft",
    reviewToken: TOKEN,
    reviewTokenExpiresAt: "2026-11-01T00:00:00.000Z",
    deletedAt: null,
    isTemplate: false,
    ...overrides,
  };
}

describe("checkReviewAccess", () => {
  it("opens review for an in-date draft", () => {
    expect(checkReviewAccess(draft(), NOW)).toEqual({ ok: true });
  });

  it.each([
    ["missing contract", null],
    ["trashed contract", draft({ deletedAt: "2026-10-01T00:00:00.000Z" })],
    ["template", draft({ isTemplate: true })],
    ["no token", draft({ reviewToken: null })],
  ])("treats a %s as not found", (_label, doc) => {
    expect(checkReviewAccess(doc, NOW)).toMatchObject({ ok: false, status: 404, code: "not_found" });
  });

  it("expires the link after its expiry time, and when no expiry is set", () => {
    expect(checkReviewAccess(draft({ reviewTokenExpiresAt: "2026-10-19T23:59:59.000Z" }), NOW)).toMatchObject({
      ok: false,
      code: "expired",
    });
    expect(checkReviewAccess(draft({ reviewTokenExpiresAt: null }), NOW)).toMatchObject({ ok: false, code: "expired" });
  });

  it.each(["sent", "completed"])("closes review once the contract is %s", (status) => {
    expect(checkReviewAccess(draft({ status }), NOW)).toMatchObject({ ok: false, status: 410, code: "not_draft" });
  });

  it("issues 30-day links", () => {
    expect(reviewLinkExpiresAt(NOW).toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });
});

describe("isWellFormedReviewToken", () => {
  it("accepts only 64 lowercase hex characters", () => {
    expect(isWellFormedReviewToken(TOKEN)).toBe(true);
    expect(isWellFormedReviewToken("A".repeat(64))).toBe(false);
    expect(isWellFormedReviewToken("a".repeat(63))).toBe(false);
    expect(isWellFormedReviewToken({ equals: TOKEN })).toBe(false);
    expect(isWellFormedReviewToken(undefined)).toBe(false);
  });
});

describe("validateReviewComment", () => {
  it("trims and keeps only the expected fields", () => {
    expect(
      validateReviewComment({ quote: "  14 days ", comment: " Can we do 30? ", section: "Payment Terms", occurrence: 1, id: 9 }),
    ).toEqual({ ok: true, value: { quote: "14 days", comment: "Can we do 30?", section: "Payment Terms", occurrence: 1 } });
  });

  it.each([
    ["no body", null],
    ["empty quote", { quote: " ", comment: "x" }],
    ["empty comment", { quote: "x", comment: "  " }],
    ["long quote", { quote: "q".repeat(REVIEW_QUOTE_MAX_LENGTH + 1), comment: "x" }],
    ["long comment", { quote: "x", comment: "c".repeat(REVIEW_COMMENT_MAX_LENGTH + 1) }],
    ["negative occurrence", { quote: "x", comment: "y", occurrence: -1 }],
  ])("rejects %s", (_label, body) => {
    expect(validateReviewComment(body).ok).toBe(false);
  });

  it("falls back to the first occurrence for non-integer input", () => {
    const result = validateReviewComment({ quote: "x", comment: "y", occurrence: "2" });
    expect(result).toMatchObject({ ok: true, value: { occurrence: 0 } });
  });
});

describe("review comment anchors", () => {
  function mount(html: string): HTMLDivElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.replaceChildren(root);
    return root;
  }

  function selectText(root: Element, needle: string, nth = 0): Range {
    const range = rangeFromAnchor(root, needle, nth);
    if (!range) throw new Error(`text not found: ${needle}`);
    return range;
  }

  it("records which occurrence of repeated text was selected, with its section", () => {
    const root = mount(
      "<h2>Pricing</h2><p>Invoices are due monthly.</p><h2>Payment Terms:</h2><p>Invoices are due within 14 days.</p>",
    );
    const anchor = anchorFromRange(root, selectText(root, "Invoices are due", 1));
    expect(anchor).toEqual({ quote: "Invoices are due", occurrence: 1, section: "Payment Terms" });

    const restored = rangeFromAnchor(root, anchor!.quote, anchor!.occurrence);
    expect(restored?.toString()).toBe("Invoices are due");
    expect(restored?.startContainer.parentElement?.previousElementSibling?.textContent).toBe("Payment Terms:");
  });

  it("anchors selections that cross formatting tags", () => {
    const root = mount("<h2>Scope of Work</h2><p>Monthly <strong>SEO reporting</strong> and audits.</p>");
    const anchor = anchorFromRange(root, selectText(root, "Monthly SEO reporting and"));
    expect(anchor).toEqual({ quote: "Monthly SEO reporting and", occurrence: 0, section: "Scope of Work" });
    expect(rangeFromAnchor(root, anchor!.quote, 0)?.toString()).toBe("Monthly SEO reporting and");
  });

  it("returns null for text that no longer exists, and falls back to the first match for a stale occurrence", () => {
    const root = mount("<p>Either party may terminate.</p>");
    expect(rangeFromAnchor(root, "thirty days", 0)).toBeNull();
    expect(rangeFromAnchor(root, "terminate", 4)?.toString()).toBe("terminate");
  });

  it("ignores selections outside the root", () => {
    const root = mount("<p>Inside</p>");
    const outside = document.createElement("p");
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    expect(anchorFromRange(root, range)).toBeNull();
  });
});
