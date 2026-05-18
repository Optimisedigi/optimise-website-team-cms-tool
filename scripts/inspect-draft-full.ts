import { getPayload } from "payload";
import config from "../src/payload.config";

const id = process.argv[2];
if (!id) {
  console.error("Usage: inspect-draft-full.ts <id>");
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
  console.log("status:           ", doc.status);
  console.log("sentAt:           ", doc.sentAt);
  console.log("postmarkMessageId:", doc.postmarkMessageId);
  console.log("ccList:           ", doc.ccList);
  console.log("recipientEmail:   ", doc.recipientEmail);
  console.log("sendError:        ", doc.sendError);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
