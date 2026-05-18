import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });
  const users = await payload.find({
    collection: "users",
    limit: 5,
    depth: 1,
    overrideAccess: true,
  });
  for (const u of users.docs as any[]) {
    console.log(`${u.email} (role=${u.role})`);
    console.log(
      `  featureAccess: ${JSON.stringify(u.featureAccess ?? [])}`,
    );
    if (u.permissionProfiles?.length) {
      console.log(
        `  permissionProfiles: ${u.permissionProfiles.map((p: any) => p.name ?? p.id).join(", ")}`,
      );
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
