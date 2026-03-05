/**
 * Contract email templates - HTML emails sent via Brevo.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
