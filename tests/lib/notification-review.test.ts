import { describe, expect, it } from "vitest";
import { groupNotificationsForReview, renderNotificationReviewHtml } from "@/lib/notification-review";

const kinds = [
  { label: "Client email received", value: "client-email-received" },
  { label: "Site health regression", value: "site-health-regression" },
];

describe("groupNotificationsForReview", () => {
  it("merges fan-out copies and groups by category and kind", () => {
    const groups = groupNotificationsForReview(
      [
        { id: 1, kind: "client-email-received", title: "Email from Acme", createdAt: "2026-10-01T00:00:00Z", recipient: 1 },
        { id: 2, kind: "client-email-received", title: "Email from Acme", createdAt: "2026-10-02T00:00:00Z", recipient: 2, readAt: "2026-10-03T00:00:00Z" },
        { id: 3, kind: "mystery-kind", title: "Odd", createdAt: "2026-10-01T00:00:00Z", recipient: 1 },
      ],
      kinds,
    );

    expect(groups.map((g) => g.key)).toEqual(["email", "seo", "other"]);
    const email = groups[0]?.kinds[0];
    expect(email?.total).toBe(2);
    expect(email?.items).toHaveLength(1);
    expect(email?.items[0]).toMatchObject({ ids: ["1", "2"], recipients: 2, unread: 1, lastSeen: "2026-10-02T00:00:00Z" });
    // Known kinds with no stored rows still appear so they can be decided on.
    expect(groups[1]?.kinds[0]).toMatchObject({ kind: "site-health-regression", total: 0, items: [] });
    expect(groups[2]?.kinds[0]?.label).toBe("mystery-kind");
  });
});

describe("renderNotificationReviewHtml", () => {
  it("escapes notification text in markup and embedded JSON", () => {
    const html = renderNotificationReviewHtml(
      groupNotificationsForReview(
        [{ id: 1, kind: "client-email-received", title: "</script><b>x</b>", createdAt: "2026-10-01T00:00:00Z" }],
        kinds,
      ),
      "2026-10-24T00:00:00Z",
    );
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('data-role="keep"');
    expect(html).toContain('id="export"');
  });
});
