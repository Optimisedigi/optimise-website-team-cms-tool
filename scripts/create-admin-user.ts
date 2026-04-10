/**
 * Create a fresh admin user using Payload's local API.
 * Run: npx tsx scripts/create-admin-user.ts
 */
import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });

  // Create a fresh admin user — Payload generates salt+hash correctly
  const user = await payload.create({
    collection: "users",
    data: {
      email: "admin@optimise.digital",
      name: "Admin User",
      password: "Optimise123!",
      role: "admin",
      setupCompleted: true,
    },
    overrideAccess: true,
  });

  const u = user as unknown as Record<string, unknown>;
  console.log("✅ Created user:", u.email);
  console.log("   ID:", u.id);
  console.log("   Hash length:", (u.hash as string)?.length);
  console.log("   Salt length:", (u.salt as string)?.length);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
