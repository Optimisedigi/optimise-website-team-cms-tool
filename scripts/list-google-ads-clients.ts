/**
 * List all clients in the production DB that have a googleAdsCustomerId set.
 * Usage:
 *   node --env-file=.env --import tsx scripts/list-google-ads-clients.ts
 */
import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const result = await payload.find({
    collection: "clients",
    where: {
      googleAdsCustomerId: { exists: true },
    },
    limit: 200,
    overrideAccess: true,
  });

  const withId = (result.docs as any[]).filter((c) => c.googleAdsCustomerId);
  console.log(`Found ${withId.length} clients with a googleAdsCustomerId:\n`);
  for (const c of withId) {
    console.log(
      `  • slug="${c.slug}"  name="${c.name}"  customerId=${c.googleAdsCustomerId}  active=${c.isActive}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
