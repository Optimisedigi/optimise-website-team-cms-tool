import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "invoice-statement-drafts" as never,
    limit: 20,
    depth: 0,
    overrideAccess: true,
  });
  console.log("Total drafts:", result.totalDocs);
  for (const doc of result.docs as any[]) {
    console.log(
      `  #${doc.id} ${doc.contactName} (${doc.status}) - ${doc.unpaidCount} unpaid, $${doc.totalOutstanding} - email: ${doc.recipientEmail || "(empty)"}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
