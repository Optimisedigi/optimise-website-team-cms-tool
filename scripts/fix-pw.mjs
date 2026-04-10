import { pbkdf2Sync } from "crypto";
import { execSync } from "child_process";

const salt = "a6e9447781e24984c8d2150d868f559c49161cb292cd3a4ccf0a5b521b53b4b8";
const email = "peter@optimisedigital.online";

// Payload's authenticate.js does:
//   crypto.pbkdf2(password, salt, 25000, 512, 'sha256', ...)
// where salt = doc.salt (the hex string stored in DB, NOT decoded)
//
// So we must use the hex string directly (not Buffer.from(salt, 'hex'))
const correctHash = pbkdf2Sync("Optimise123!", salt, 25000, 64, "sha256").toString("hex");
console.log("Correct hash (salt as hex str, keylen=64):", correctHash);

execSync(
  `sqlite3 /Users/Pe/my-projects/content-cms/content.db "UPDATE users SET hash='${correctHash}', login_attempts=0, lock_until=NULL, setup_completed=1 WHERE email='${email}';"`,
);

const check = execSync(
  `sqlite3 /Users/Pe/my-projects/content-cms/content.db "SELECT hash FROM users WHERE email='${email}';"`,
)
  .toString()
  .trim();
console.log("Verified stored:", check.substring(0, 30));
console.log("Match:", check === correctHash);
