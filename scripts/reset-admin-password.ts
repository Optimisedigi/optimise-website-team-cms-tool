/**
 * Reset admin password to default.
 * Run: npx tsx scripts/reset-admin-password.ts
 */
import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });

  const users = await payload.find({
    collection: "users",
    where: { email: { equals: "peter@optimisedigital.online" } },
    overrideAccess: true,
  });

  if (!users.docs.length) {
    console.log("User not found — creating...");
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
    console.log("✅ Created user:", user.email);
    return;
  }

  const u = await payload.update({
    collection: "users",
    id: users.docs[0].id,
    data: { password: "Optimise123!" },
    overrideAccess: true,
  });
  console.log("✅ Reset password for:", u.email);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
