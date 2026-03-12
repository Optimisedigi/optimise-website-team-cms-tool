import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";
import { runGscMonitor } from "@/lib/gsc-monitor";
import { processIndexingBatches } from "@/lib/gsc-indexing";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Authenticate via CRON_SECRET bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Timing-safe comparison
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runGscMonitor();

    // Send email digest if there are critical or warning alerts
    const alertResults = results.filter(
      (r) =>
        r.alerts.length > 0 &&
        r.alerts.some((a) => a.severity === "critical" || a.severity === "warning")
    );

    if (alertResults.length > 0 && process.env.SENDGRID_API_KEY && process.env.ALERT_EMAIL_FROM && process.env.ALERT_EMAIL_TO) {
      await sendAlertDigest(alertResults);
    }

    // Process any pending indexing audit batches
    try {
      await processIndexingBatches();
    } catch (err) {
      console.error("[gsc-cron] Indexing batch processing error:", err);
    }

    return NextResponse.json({
      ok: true,
      clientsProcessed: results.length,
      clientsWithAlerts: alertResults.length,
      errors: results.filter((r) => r.error).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron job failed";
    console.error("[gsc-cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendAlertDigest(
  results: Array<{
    clientName: string;
    alerts: Array<{
      severity: string;
      category: string;
      title: string;
      description: string;
    }>;
  }>
) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

  const alertLines = results
    .map((r) => {
      const lines = r.alerts
        .filter((a) => a.severity === "critical" || a.severity === "warning")
        .map(
          (a) =>
            `  [${a.severity.toUpperCase()}] ${a.title}\n  ${a.description}`
        )
        .join("\n\n");
      return `${r.clientName}:\n${lines}`;
    })
    .join("\n\n---\n\n");

  const htmlAlerts = results
    .map((r) => {
      const items = r.alerts
        .filter((a) => a.severity === "critical" || a.severity === "warning")
        .map(
          (a) =>
            `<li><strong style="color: ${a.severity === "critical" ? "#dc2626" : "#d97706"}">[${a.severity.toUpperCase()}]</strong> ${a.title}<br/><span style="color: #6b7280">${a.description}</span></li>`
        )
        .join("");
      return `<h3>${r.clientName}</h3><ul>${items}</ul>`;
    })
    .join("<hr/>");

  await sgMail.send({
    from: process.env.ALERT_EMAIL_FROM!,
    to: process.env.ALERT_EMAIL_TO!,
    subject: `GSC Alert Digest — ${results.length} client(s) need attention`,
    text: `GSC Monthly Alert Digest\n\n${alertLines}`,
    html: `<h2>GSC Monthly Alert Digest</h2>${htmlAlerts}`,
  });
}
