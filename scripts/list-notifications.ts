import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "notifications" as never,
    where: { kind: { equals: "invoice-statements-ready" } } as never,
    limit: 10,
    depth: 1,
    overrideAccess: true,
  });
  console.log("Notifications:", result.totalDocs);
  for (const doc of result.docs as any[]) {
    console.log(
      `  #${doc.id} → user ${doc.recipient?.email || doc.recipient?.id}: "${doc.title}" — read: ${doc.readAt ?? "no"}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
