import { describe, expect, it } from "vitest";
import { appendGmailSignature, formatGmailDraftHtml } from "@/lib/gmail-service";

describe("formatGmailDraftHtml", () => {
  it("wraps draft HTML in Gmail's native Verdana normal-size styling", () => {
    expect(formatGmailDraftHtml("<p>Hello</p>")).toBe(
      '<div data-optimate-gmail-draft-font="true" style="font-family:Verdana,sans-serif;font-size:small;margin:0;padding:0;">Hello</div>',
    );
  });

  it("normalises generated font styles to Gmail's native editable style", () => {
    const html = formatGmailDraftHtml(
      '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">Hello</p>',
    );

    expect(html).toContain("font-family:Verdana,sans-serif;");
    expect(html).toContain("font-size:small;");
    expect(html).not.toContain("font-family:Arial");
    expect(html).not.toContain("font-size:14px");
    expect(html).not.toContain("font-size:13px");
  });

  it("keeps Gmail-edited text on the same native font style as the draft body", () => {
    const html = formatGmailDraftHtml(
      '<p>We’ve <span class="gmail_default" style="font-family:verdana,sans-serif;font-size:small">edited this text</span> today.</p>',
    );

    expect(html).toContain("font-family:Verdana,sans-serif;font-size:small");
    expect(html).not.toMatch(/font-size:\s*\d+px/i);
  });

  it("turns paragraph blocks into editable Gmail blank lines", () => {
    expect(formatGmailDraftHtml("<p>Hi Jane,</p><p>Thanks,</p><p>Peter</p>")).toBe(
      '<div data-optimate-gmail-draft-font="true" style="font-family:Verdana,sans-serif;font-size:small;margin:0;padding:0;">Hi Jane,<br><br>Thanks,<br><br>Peter</div>',
    );
  });

  it("keeps one blank line between a wrapped report and the Gmail signature", () => {
    const report = '<div><p>Reach out if you have any questions.</p></div>';
    const signed = appendGmailSignature(report, "Thanks,<br>Peter");

    expect(signed).toBe(
      '<div><p>Reach out if you have any questions.</p></div><br>Thanks,<br>Peter',
    );
  });

  it("does not double-wrap already normalised drafts", () => {
    const html = '<div data-optimate-gmail-draft-font="true" style="font-family:Verdana,sans-serif;font-size:small;margin:0;padding:0;">Hello<br><br>World</div>';

    expect(formatGmailDraftHtml(html)).toBe(html);
  });
});
