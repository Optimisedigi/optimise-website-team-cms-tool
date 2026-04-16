/**
 * Client Timeline Email Generator
 *
 * Generates a styled HTML email summarising a ClientTimeline's progress,
 * suitable for copying and pasting into a client update. Also produces a
 * plain-text fallback.
 */

export interface TimelineEmailData {
  clientName: string;
  timelineTitle: string;
  serviceType: string;
  startDate?: string | null;
  endDate?: string | null;
  phases: Array<{
    phaseName: string;
    weekRange?: string | null;
    phaseDescription?: string | null;
    items: Array<{
      itemName: string;
      itemDescription?: string | null;
      itemStatus: string;
      estimatedHours: number | null;
      requiresApproval: boolean;
      approvalStatus: string;
    }>;
  }>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function serviceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    google_ads: "Google Ads",
    seo: "SEO",
    meta_ads: "Meta Ads",
    cro: "CRO",
    general: "General",
  };
  return labels[type] ?? type;
}

/**
 * Compute completion % based on item count.
 */
function completionPercentage(
  phases: TimelineEmailData["phases"],
): { total: number; completed: number; pct: number } {
  let total = 0;
  let completed = 0;
  for (const phase of phases) {
    for (const item of phase.items) {
      total++;
      if (item.itemStatus === "completed" || item.itemStatus === "skipped") {
        completed++;
      }
    }
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, pct };
}

/**
 * Week info given a start date and (optional) end date vs today.
 * Weeks run Friday → Thursday (the week containing the start date uses
 * the start date as its anchor; subsequent weeks start every 7 days).
 */
function weekProgress(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): { currentWeek: number; totalWeeks: number; expectedPct: number } {
  if (!startDate) return { currentWeek: 0, totalWeeks: 0, expectedPct: 0 };
  try {
    const start = new Date(startDate).getTime();
    const end = endDate ? new Date(endDate).getTime() : start + 90 * 86400000;
    const totalMs = end - start;
    const totalDays = Math.round(totalMs / 86400000);
    const totalWeeks = Math.ceil(totalDays / 7) || 13;
    const now = Date.now();
    if (now <= start) return { currentWeek: 0, totalWeeks, expectedPct: 0 };

    // How far through the total timeline are we (0–1)?
    const totalElapsed = Math.max(0, Math.min(1, (now - start) / totalMs));
    // Current week (1-based)
    const fractionalWeek = totalElapsed * totalWeeks;
    const currentWeek = Math.min(totalWeeks, Math.ceil(fractionalWeek));

    // Expected %: where we should be right now based on elapsed time
    const expectedPct = Math.round(totalElapsed * 100);

    return { currentWeek, totalWeeks, expectedPct };
  } catch {
    return { currentWeek: 0, totalWeeks: 0, expectedPct: 0 };
  }
}

/**
 * Resolve display status for an item.
 * If awaiting approval, show "Awaiting approval" regardless of itemStatus.
 */
function itemStatusText(item: TimelineEmailData["phases"][0]["items"][0]): string {
  const isAwaitingApproval =
    item.approvalStatus === "awaiting_approval" ||
    item.approvalStatus === "pending_approval";
  if (isAwaitingApproval) return "Awaiting your approval";
  if (item.itemStatus === "completed") return "Done";
  if (item.itemStatus === "skipped") return "Skipped";
  if (item.itemStatus === "in_progress") return "In progress";
  return "Pending";
}

/**
 * Colour for the status text and dot.
 */
function itemStatusColor(item: TimelineEmailData["phases"][0]["items"][0]): string {
  const isAwaitingApproval =
    item.approvalStatus === "awaiting_approval" ||
    item.approvalStatus === "pending_approval";
  if (isAwaitingApproval) return "#d97706";
  if (item.itemStatus === "completed") return "#16a34a";
  if (item.itemStatus === "skipped") return "#f59e0b";
  if (item.itemStatus === "in_progress") return "#3b82f6";
  return "#9ca3af";
}

export function generateClientTimelineEmailHtml(data: TimelineEmailData): string {
  const { clientName, timelineTitle, serviceType, startDate, endDate, phases } =
    data;
  const { total, completed, pct } = completionPercentage(phases);
  const { currentWeek, totalWeeks, expectedPct } = weekProgress(startDate, endDate);
  const dateRange =
    startDate || endDate
      ? `${formatDate(startDate)} - ${formatDate(endDate)}`
      : "—";

  // Build phase/task rows
  const phaseSections = phases
    .map((phase) => {
      const itemRows = phase.items
        .map((item) => {
          const isDone =
            item.itemStatus === "completed" || item.itemStatus === "skipped";
          const statusText = itemStatusText(item);
          const statusColor = itemStatusColor(item);
          const desc = item.itemDescription
            ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">${escapeHtml(item.itemDescription)}</div>`
            : "";
          return `<div style="display:flex;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f4f6;gap:12px">
  <div style="width:10px;height:10px;border-radius:50%;background:${statusColor};flex-shrink:0;margin-top:4px"></div>
  <div style="flex:1">
    <div style="font-size:14px;color:${isDone ? "#9ca3af" : "#111827"};text-decoration:${isDone ? "line-through" : "none"}">
      ${escapeHtml(item.itemName)}
    </div>
    ${desc}
  </div>
  <div style="font-size:12px;color:${statusColor};white-space:nowrap;margin-top:2px;font-weight:500">${statusText}</div>
</div>`;
        })
        .join("\n");

      const phaseHeader = phase.weekRange
        ? `<span style="font-size:14px;font-weight:400;color:#6b7280;margin-left:8px">${escapeHtml(phase.weekRange)}</span>`
        : "";
      const phaseDesc = phase.phaseDescription
        ? `<div style="color:#6b7280;font-size:13px;margin-bottom:12px;line-height:1.5">${escapeHtml(phase.phaseDescription)}</div>`
        : "";

      return `<div style="margin-bottom:24px">
  <div style="padding:16px 0 8px;border-bottom:2px solid #e5e7eb">
    <div style="display:flex;align-items:baseline;gap:0">
      <span style="font-size:16px;font-weight:700;color:#111827">${escapeHtml(phase.phaseName)}</span>
      ${phaseHeader}
    </div>
    ${phaseDesc}
  </div>
  ${itemRows}
</div>`;
    })
    .join("\n");

  // Week display
  const weekLabel =
    currentWeek > 0 && totalWeeks > 0
      ? `Week ${currentWeek} of ${totalWeeks}`
      : "";

  // Schedule note — always positive, always green
  const scheduleNote =
    pct >= 80 && currentWeek >= totalWeeks * 0.8
      ? `<div style="font-size:13px;color:#16a34a;font-weight:600;padding-top:6px">Great progress — we're right on track!</div>`
      : pct >= 50
      ? `<div style="font-size:13px;color:#16a34a;font-weight:600;padding-top:6px">Solid progress — we're moving through the plan nicely.</div>`
      : `<div style="font-size:13px;color:#16a34a;font-weight:600;padding-top:6px">We've made a strong start and are moving full steam ahead.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(timelineTitle)}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff;color:#111827">
<div style="max-width:600px;margin:0;padding:5px 24px 5px">

  <!-- Progress Section -->
  <div style="background:#f9fafb;border-radius:8px;padding:20px 24px;margin-bottom:28px;margin-left:-24px;margin-right:-24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:12px"><tr>
      <td style="padding:0;font-size:15px;font-weight:700;color:#111827" align="left">Overall Progress</td>
      <td style="padding:0;font-size:14px;color:#6b7280" align="right">${completed} of ${total} tasks &nbsp;(${pct}%)</td>
    </tr></table>
    <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <div style="height:8px;background:#e5e7eb;border-radius:999px;margin-bottom:0;margin-left:0">
      <div style="background:#16a34a;height:8px;width:${pct}%;border-radius:999px"></div>
    </div>
    ${expectedPct > 0 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:10px"><tr><td style="padding:0;width:${expectedPct}%;font-size:0;line-height:0" width="${expectedPct}%"></td><td style="padding:0;width:2px;font-size:0;line-height:0" width="2"><div style="width:2px;height:14px;background:#eab308;border-radius:1px;margin-top:-4px"></div></td><td style="padding:0;font-size:0;line-height:0"></td></tr></table>` : `<div style="margin-bottom:10px"></div>`}
    <!--[if mso]></td></tr></table><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:6px"><tr>
      <td style="padding:0;font-size:12px;color:#6b7280" align="left">${startDate ? `Work commenced: ${formatDate(startDate)}` : ""}</td>
      <td style="padding:0;font-size:12px;color:#6b7280" align="right">${weekLabel}</td>
    </tr></table>
    ${scheduleNote}
  </div>

  <!-- Phase & Tasks -->
  <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:4px">Phases &amp; Tasks</div>
  ${phaseSections}

</div>
</body>
</html>`;
}

export function generateClientTimelineEmailPlain(data: TimelineEmailData): string {
  const { clientName, timelineTitle, serviceType, startDate, endDate, phases } =
    data;
  const { total, completed, pct } = completionPercentage(phases);
  const { currentWeek, totalWeeks } = weekProgress(startDate, endDate);
  const weekLabel =
    currentWeek > 0 && totalWeeks > 0 ? `Week ${currentWeek} of ${totalWeeks}` : "";

  const lines: string[] = [
    `Progress: ${completed} of ${total} tasks (${pct}%)${weekLabel ? ` | ${weekLabel}` : ""}${startDate ? ` | Work commenced ${formatDate(startDate)}` : ""}`,
    pct >= 80 && currentWeek >= totalWeeks * 0.8
      ? "Great progress — we're right on track!"
      : pct >= 50
      ? "Solid progress — we're moving through the plan nicely."
      : "We've made a strong start and are moving full steam ahead.",
    "",
    "Phases & Tasks",
    `${"=".repeat(40)}`,
    "",
  ];

  for (const phase of phases) {
    const header = phase.weekRange
      ? `${phase.phaseName} (${phase.weekRange})`
      : phase.phaseName;
    lines.push(`${header.toUpperCase()}`);
    if (phase.phaseDescription) lines.push(phase.phaseDescription);
    for (const item of phase.items) {
      const status = itemStatusText(item);
      const check =
        item.itemStatus === "completed" || item.itemStatus === "skipped"
          ? "[x]"
          : "[ ]";
      lines.push(`  ${check} ${item.itemName} - ${status}`);
      if (item.itemDescription) lines.push(`       ${item.itemDescription}`);
    }
    lines.push("");
  }

  return lines.filter(Boolean).join("\n");
}
