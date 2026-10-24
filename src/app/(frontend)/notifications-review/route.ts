import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { Notifications } from "@/collections/Notifications";
import {
  groupNotificationsForReview,
  renderNotificationReviewHtml,
  type ReviewKindOption,
  type ReviewSourceRow,
} from "@/lib/notification-review";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

function kindOptions(): ReviewKindOption[] {
  const field = Notifications.fields.find((f) => "name" in f && f.name === "kind");
  if (!field || !("options" in field) || !Array.isArray(field.options)) return [];
  return field.options.flatMap((o) =>
    typeof o === "string" ? [{ label: o, value: o }] : [{ label: String(o.label), value: o.value }],
  );
}

/**
 * GET /notifications-review
 *
 * Admin-only HTML page listing every stored notification (all recipients),
 * grouped by category and kind, with keep/remove checkboxes, comments, and a
 * JSON export of the decisions.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.redirect(new URL("/admin/login?redirect=%2Fnotifications-review", req.url));
  }
  if ((user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows: ReviewSourceRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await payload.find({
      collection: "notifications" as never,
      limit: PAGE_SIZE,
      page,
      sort: "-createdAt",
      depth: 0,
      overrideAccess: true,
      select: { kind: true, title: true, body: true, url: true, readAt: true, createdAt: true, recipient: true } as never,
    });
    rows.push(...(result.docs as unknown as ReviewSourceRow[]));
    if (!result.hasNextPage) break;
  }

  const html = renderNotificationReviewHtml(
    groupNotificationsForReview(rows, kindOptions()),
    new Date().toISOString(),
  );
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
