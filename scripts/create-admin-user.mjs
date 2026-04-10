import { getPayload } from "payload";
import config from "../src/payload.config.ts";

const payload = await getPayload({ config });

// Create a fresh admin user - Payload will generate salt+hash correctly
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

console.log("✅ Created user:", (user as any).email);
console.log("   ID:", user.id);
