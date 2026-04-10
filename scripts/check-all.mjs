import { execSync } from "child_process";
import { pbkdf2Sync } from "crypto";

// Read all users
const users = execSync(
  `sqlite3 /Users/Pe/my-projects/content-cms/content.db "SELECT id, email, name, length(hash), length(salt) FROM users;"`,
)
  .toString()
  .trim()
  .split("\n");

console.log("All users:");
for (const row of users) {
  console.log(" ", row);
}

// Also try a simple PBKDF2 with keylen=512
const salt = "a6e9447781e24984c8d2150d868f559c49161cb292cd3a4ccf0a5b521b53b4b8";
const hash64 = pbkdf2Sync("Optimise123!", salt, 25000, 64, "sha256").toString("hex");
const hash512 = pbkdf2Sync("Optimise123!", salt, 25000, 512, "sha256").toString("hex");
console.log("\nHash with keylen=64:", hash64.length, "chars");
console.log("Hash with keylen=512:", hash512.length, "chars");
