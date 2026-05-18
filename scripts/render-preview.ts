/**
 * Renders the full statement email exactly as the preview iframe would,
 * then prints the padding value that ends up in the signature. Use to
 * confirm whether the live template values are flowing through correctly.
 */

import { getPayload } from "payload";
import config from "../src/payload.config";
import { buildStatementEmail } from "../src/lib/invoice-statement-email";
import { loadStatementTemplates } from "../src/lib/invoice-statement-templates";

async function main() {
  const payload = await getPayload({ config });
  const draft = (await payload.findByID({
    collection: "invoice-statement-drafts" as never,
    id: "1",
    overrideAccess: true,
  })) as any;

  const { templates, signatureHtml } = await loadStatementTemplates(payload);
  console.log("signatureHtml padding match:");
  console.log("  ", signatureHtml.match(/padding:0 \d+px 8px 0/g));

  const out = buildStatementEmail({
    snapshot: draft.snapshot,
    customMessage: draft.customMessage,
    greetingOverride: draft.greetingOverride,
    templates,
    signatureHtml,
    attachmentsAttached: true,
  });

  console.log("Final html padding match:");
  console.log("  ", out.html.match(/padding:0 \d+px 8px 0/g));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
