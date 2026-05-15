import { describe, expect, it } from "vitest";
import {
  buildReminderEmail,
  formatAnniversaryDate,
} from "@/lib/contract-reminder-email";

describe("formatAnniversaryDate", () => {
  it("renders en-AU long-form in UTC", () => {
    expect(formatAnniversaryDate("2027-05-15T00:00:00.000Z")).toBe(
      "15 May 2027",
    );
  });

  it("handles invalid input safely", () => {
    expect(formatAnniversaryDate("not-a-date")).toBe("(invalid date)");
  });
});

describe("buildReminderEmail", () => {
  const baseInput = {
    recipientName: "Peter",
    clientName: "Acme Pty Ltd",
    contractTitle: "Google Ads Retainer",
    contractDate: "2026-05-15T00:00:00.000Z",
    anniversaryDate: "2027-04-15T00:00:00.000Z",
    contractAdminUrl:
      "https://optimise-website-team-cms-tool.vercel.app/admin/collections/contracts/123",
  } as const;

  it("builds the 11-month variant with 30-day phrasing", () => {
    const out = buildReminderEmail({ ...baseInput, kind: "11-month" });

    expect(out.subject).toBe(
      "Annual review due in ~30 days \u2014 Acme Pty Ltd",
    );
    expect(out.text).toContain("Hi Peter,");
    expect(out.text).toContain("about four weeks");
    expect(out.text).toContain("Client: Acme Pty Ltd");
    expect(out.text).toContain("12-month anniversary: 15 May 2027");
    expect(out.text).toContain(baseInput.contractAdminUrl);
  });

  it("builds the 11.5-month variant with 2-week phrasing", () => {
    const out = buildReminderEmail({ ...baseInput, kind: "11.5-month" });

    expect(out.subject).toBe(
      "Annual review due in ~2 weeks \u2014 Acme Pty Ltd",
    );
    expect(out.text).toContain("about two weeks");
  });

  it("escapes HTML in user-supplied values", () => {
    const out = buildReminderEmail({
      ...baseInput,
      kind: "11-month",
      clientName: "Smith & Jones <Ltd>",
      contractTitle: 'Retainer "2026"',
    });

    expect(out.html).toContain("Smith &amp; Jones &lt;Ltd&gt;");
    expect(out.html).toContain("Retainer &quot;2026&quot;");
    // Subject is plain text, not HTML — should keep the original chars.
    expect(out.subject).toContain("Smith & Jones <Ltd>");
  });

  it("falls back gracefully when client/recipient/title are missing", () => {
    const out = buildReminderEmail({
      ...baseInput,
      kind: "11-month",
      recipientName: null,
      clientName: null,
      contractTitle: undefined,
    });

    expect(out.text).toContain("Hi team,");
    expect(out.subject).toContain("Client");
    expect(out.text).toContain("Contract: Contract");
  });

  it("computes the 12-month anniversary from contractDate, not anniversaryDate", () => {
    // contractDate Jan 1 + 12mo = Jan 1 next year, regardless of what
    // anniversaryDate is set to. The reminder's `sendAt` is the lead-time
    // (11 or 11.5 months in); the *anniversary* shown in the email body
    // is always contractDate + 12 months.
    const out = buildReminderEmail({
      ...baseInput,
      kind: "11-month",
      contractDate: "2026-01-01T00:00:00.000Z",
      anniversaryDate: "2027-04-15T00:00:00.000Z",
    });

    expect(out.text).toContain("12-month anniversary: 1 January 2027");
  });

  it("returns text/html with a clickable admin link", () => {
    const out = buildReminderEmail({ ...baseInput, kind: "11-month" });

    expect(out.html).toContain(`href="${baseInput.contractAdminUrl}"`);
    expect(out.html).toContain("Open contract in admin");
  });
});
