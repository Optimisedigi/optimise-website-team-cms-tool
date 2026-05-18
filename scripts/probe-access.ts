import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });

  const adminUser = await payload.find({
    collection: "users",
    where: { email: { equals: "peter@optimisedigital.online" } } as never,
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });
  const admin = adminUser.docs[0];
  if (!admin) {
    console.log("No admin user found");
    process.exit(1);
  }
  console.log("admin role:", (admin as any).role);

  // Simulate the access call manually.
  const { canAccess } = await import("../src/lib/access");
  const fn = canAccess("nav:invoices");
  const result = (fn as any)({ req: { user: admin } });
  console.log("canAccess('nav:invoices') for admin:", result);

  // Try the actual find with the admin as the req user.
  try {
    const found = await payload.find({
      collection: "invoice-statement-drafts" as never,
      limit: 5,
      depth: 0,
      user: admin as any,
    });
    console.log("find with admin user:", found.totalDocs, "rows");
  } catch (e) {
    console.log("find threw:", (e as Error).message);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
