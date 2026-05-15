/**
 * Refresh the live email-templates global with the latest defaults from
 * EmailTemplates.ts (signature HTML, payment methods HTML, opening line).
 *
 * Defaults baked into Payload field configs only seed on first creation \u2014
 * once the row exists, edits to defaults in code do nothing. Run this when
 * you change the defaults and want the live values to match.
 *
 *   npx tsx --env-file=.env scripts/refresh-statement-template-defaults.ts
 */

import { getPayload } from "payload";
import config from "../src/payload.config";

const SIGNATURE_LOGO_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/optimise-digital-logo-rocket-animation.gif";
const SIGNATURE_GOOGLE_BADGE_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/google-partner.png";
const SIGNATURE_META_BADGE_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/meta-partner.png";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td style="padding-bottom:4px;width:200px;">
      <a href="https://optimisedigital.online/?utm_source=email&amp;utm_medium=sig" style="text-decoration:none;">
        <img src="${SIGNATURE_LOGO_URL}" width="200" height="19" alt="Optimise Digital" style="display:block;border:0;outline:none;text-decoration:none;" />
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 70px 8px 0;width:200px;text-align:center;">
      <font face="Verdana" size="1"><b>Growth that compounds</b></font>
    </td>
  </tr>
  <tr>
    <td style="width:200px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px;">
            <img src="${SIGNATURE_META_BADGE_URL}" width="96" height="14" alt="Meta Business Partner" style="display:block;border:0;outline:none;text-decoration:none;" />
          </td>
          <td>
            <img src="${SIGNATURE_GOOGLE_BADGE_URL}" width="96" height="15" alt="Google Best Practices" style="display:block;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

const PAYMENT_METHODS_HTML = `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">
  Bank deposit:<br />
  &nbsp;&nbsp;Account: <strong>Optimise Digital Pty Ltd</strong><br />
  &nbsp;&nbsp;BSB: <strong>062-692</strong><br />
  &nbsp;&nbsp;Account number: <strong>1117 6620</strong><br />
  &nbsp;&nbsp;Reference: your invoice number(s)
</p>
<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">
  Or click any <strong>View &amp; pay</strong> link above to pay online via card.
</p>`;

const OPENING_LINE =
  "Quick consolidated summary of your account with us. Here's everything currently open in one place.";

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  await payload.updateGlobal({
    slug: "email-templates" as never,
    overrideAccess: true,
    data: {
      signatureHtml: SIGNATURE_HTML,
      statementPaymentMethodsHtml: PAYMENT_METHODS_HTML,
      statementOpeningLine: OPENING_LINE,
    } as never,
  });

  console.log("Email-templates global refreshed:");
  console.log("  - signatureHtml: Meta left of Google, Growth-that-compounds centred");
  console.log("  - statementPaymentMethodsHtml: removed 'Payment methods' header");
  console.log("  - statementOpeningLine: em-dash replaced with full stop");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
