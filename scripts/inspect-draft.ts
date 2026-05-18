/**
 * Dump the snapshot for a single invoice-statement-drafts row so we can see
 * exactly what Xero gave us for contact name + first name.
 *
 *   npx tsx --env-file=.env scripts/inspect-draft.ts <id>
 */

import { getPayload } from "payload";
import config from "../src/payload.config";

const id = process.argv[2];
if (!id) {
  console.error("Usage: inspect-draft.ts <id>");
  process.exit(1);
}

async function main(): Promise<void> {
  const payload = await getPayload({ config });
  const doc = (await payload.findByID({
    collection: "invoice-statement-drafts" as never,
    id,
    depth: 0,
    overrideAccess: true,
  })) as any;
  console.log("contactName:    ", JSON.stringify(doc.contactName));
  console.log("recipientEmail: ", JSON.stringify(doc.recipientEmail));
  console.log("snapshot.contact:");
  console.log(JSON.stringify(doc.snapshot?.contact, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
