/**
 * Quick smoke test: confirms the invoice-statement-drafts table exists and
 * can be queried via the Payload client. Reads no real data, just runs a
 * `find` with `limit: 1`.
 *
 *   npx tsx --env-file=.env scripts/verify-statement-drafts-table.ts
 */

import { getPayload } from "payload";
import config from "../src/payload.config";

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  const result = await payload.find({
    collection: "invoice-statement-drafts" as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  console.log(
    `OK — invoice-statement-drafts table reachable. totalDocs: ${result.totalDocs}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
