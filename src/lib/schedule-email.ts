/**
 * Meeting scheduler email templates - HTML emails sent via Brevo.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render free-text meeting topic into HTML that matches the formatting used in
 * the CMS / public schedule page: lines starting with -, *, • or "1." become
 * bullet list items; blank lines separate blocks; everything else is a paragraph.
 */
function renderMeetingTopicHtml(text: string): string {
  type Block = { type: "paragraph"; text: string } | { type: "list"; items: string[] };
  const blocks: Block[] = [];
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      continue;
    }
    flushList();
    blocks.push({ type: "paragraph", text: trimmed });
  }
  flushList();

  return blocks
    .map((block) => {
      if (block.type === "list") {
        const items = block.items
          .map(
            (item) =>
              `<li style="margin:0 0 4px;font-size:14px;color:#64748b;">${escapeHtml(item)}</li>`,
          )
          .join("");
        return `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 12px;font-size:14px;color:#64748b;">${escapeHtml(block.text)}</p>`;
    })
    .join("");
}

function getPublicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://cms.optimisedigital.online")
  ).replace(/\/$/, "");
}

function baseTemplate(content: string): string {
  const logoUrl = `${getPublicBaseUrl()}/optimise-digital-logo-white.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimise Digital</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1e293b;padding:24px 32px;">
              <img src="${escapeHtml(logoUrl)}" alt="Optimise Digital" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateScheduleInviteEmail(opts: {
  recipientName: string;
  meetingTitle: string;
  meetingTopic?: string;
  durationMinutes: string;
  attendeeEmails: string[];
  scheduleUrl: string;
  suggestedByName?: string;
}): string {
  const attendeeEmails = opts.attendeeEmails.filter((email) => email.trim().length > 0);
  const attendeesLine = attendeeEmails.length > 0
    ? `<p style="margin:0 0 8px;font-size:14px;color:#64748b;"><strong style="color:#1e293b;">Attendees:</strong> ${escapeHtml(attendeeEmails.join(", "))}</p>`
    : "";
  const topicLine = opts.meetingTopic && opts.meetingTopic.trim()
    ? `<p style="margin:0 0 8px;font-size:14px;color:#1e293b;font-weight:600;">What's covered:</p>${renderMeetingTopicHtml(opts.meetingTopic)}`
    : "";

  const introLine = opts.suggestedByName
    ? `${escapeHtml(opts.suggestedByName)} suggested you join this meeting. Please select your availability and we will automatically send a time that works for everyone.`
    : "To save everyone time, please select your availability below. This is an automated scheduling process, and a calendar invitation will be sent automatically once a time is found that works for all attendees.";

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      ${introLine}
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Meeting:</strong> ${escapeHtml(opts.meetingTitle)}
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Duration:</strong> ${escapeHtml(opts.durationMinutes)} minutes
    </p>
    ${attendeesLine}
    ${topicLine}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:8px 0 24px;">
          <a href="${escapeHtml(opts.scheduleUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;">
            Select Your Availability
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
      It only takes a moment. Once everyone has responded, we will send a calendar invite.
    </p>
  `;
  return baseTemplate(content);
}

export function generateScheduleConfirmedEmail(opts: {
  recipientName: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  durationMinutes: string;
  timezone: string;
}): string {
  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Great news! A meeting time has been confirmed that works for everyone.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#166534;">${escapeHtml(opts.meetingTitle)}</p>
          <p style="margin:0 0 4px;font-size:14px;color:#15803d;">
            ${escapeHtml(opts.meetingDate)} at ${escapeHtml(opts.meetingTime)}
          </p>
          <p style="margin:0;font-size:13px;color:#16a34a;">
            ${escapeHtml(opts.durationMinutes)} minutes (${escapeHtml(opts.timezone)})
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:14px;color:#64748b;">
      A Google Calendar invite has been sent to all attendees. See you there!
    </p>
  `;
  return baseTemplate(content);
}

export function generateNoMatchEmail(opts: {
  meetingTitle: string;
  attendeeSummary: string;
}): string {
  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">No matching time found</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      All attendees have responded for <strong>${escapeHtml(opts.meetingTitle)}</strong>, but no common time slot was found.
    </p>
    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#991b1b;white-space:pre-line;">${escapeHtml(opts.attendeeSummary)}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#64748b;">
      Consider proposing new dates or reaching out to attendees directly.
    </p>
  `;
  return baseTemplate(content);
}
