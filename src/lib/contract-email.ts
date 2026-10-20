/**
 * Contract email templates - HTML emails sent via Brevo.
 */

import { escapeHtml } from "@/lib/html-escape"

function baseTemplate(content: string): string {
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
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Optimise Digital</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                Optimise Digital Pty Ltd
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateSigningInviteEmail(opts: {
  recipientName: string;
  contractTitle: string;
  signingUrl: string;
  senderName: string;
}): string {
  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Optimise Digital has prepared a contract for your review and signature.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Contract:</strong> ${escapeHtml(opts.contractTitle)}
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
      Please click the button below to review the contract details and provide your signature. A signed copy from both parties will be emailed to you. This link will expire in 7 days.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${escapeHtml(opts.signingUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;">
            Review &amp; Sign Contract
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      If you have any questions, please contact ${escapeHtml(opts.senderName)} directly.
    </p>
`;

  return baseTemplate(content);
}

export function generateReviewInviteEmail(opts: {
  recipientName: string;
  contractTitle: string;
  reviewUrl: string;
  senderName: string;
  expiresInDays: number;
}): string {
  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Here's the draft agreement for you to look over before it goes out for signing.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Contract:</strong> ${escapeHtml(opts.contractTitle)}
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
      If anything needs changing, you can highlight the wording and leave a note right on the page. This link is valid for ${opts.expiresInDays} days.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${escapeHtml(opts.reviewUrl)}" style="display:inline-block;background:#1b4332;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;">
            View Draft Contract
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      Questions? Reply to this email or contact ${escapeHtml(opts.senderName)} directly.
    </p>
`;

  return baseTemplate(content);
}

export function generateReviewCommentsEmail(opts: {
  recipientName: string;
  reviewerName: string;
  contractTitle: string;
  comments: Array<{ quote: string; section: string; comment: string }>;
  adminUrl: string;
  reviewUrl: string;
}): string {
  const items = opts.comments
    .map(
      (c, i) => `
    <tr>
      <td style="padding:14px 0;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">${i + 1}.${c.section ? ` ${escapeHtml(c.section)}` : ""}</p>
        <p style="margin:0 0 8px;padding:8px 12px;background:#fef9c3;border-left:3px solid #ca8a04;font-size:13px;color:#475569;font-style:italic;">&ldquo;${escapeHtml(c.quote)}&rdquo;</p>
        <p style="margin:0;font-size:14px;color:#1e293b;white-space:pre-wrap;">${escapeHtml(c.comment)}</p>
      </td>
    </tr>`,
    )
    .join("");

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      ${escapeHtml(opts.reviewerName)} left ${opts.comments.length} comment${opts.comments.length === 1 ? "" : "s"} on the draft contract.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Contract:</strong> ${escapeHtml(opts.contractTitle)}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">${items}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(opts.adminUrl)}" style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">
            Open Contract in CMS
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      <a href="${escapeHtml(opts.reviewUrl)}" style="color:#64748b;">See the comments on the draft</a>
    </p>
`;

  return baseTemplate(content);
}

export function generateCompletionEmail(opts: {
  recipientName: string;
  contractTitle: string;
  pdfUrl: string;
  isAgencyCopy: boolean;
}): string {
  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">Hi ${escapeHtml(opts.recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      ${opts.isAgencyCopy
        ? "The client has signed the contract. Both parties have now signed."
        : "Thank you for signing. Both parties have now signed the contract."}
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b;">
      <strong style="color:#1e293b;">Contract:</strong> ${escapeHtml(opts.contractTitle)}
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
      A copy of the fully signed contract is in the link below for your records.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${escapeHtml(opts.pdfUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;">
            Download Signed Contract (PDF)
          </a>
        </td>
      </tr>
    </table>
`;

  return baseTemplate(content);
}
