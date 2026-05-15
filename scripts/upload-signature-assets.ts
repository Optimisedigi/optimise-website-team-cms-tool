/**
 * One-off: upload the three brand-signature assets to Vercel Blob.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/upload-signature-assets.ts
 *
 * Outputs the three URLs to stdout so we can paste them into
 * `src/globals/EmailTemplates.ts` defaults. No-op for runtime \u2014 just a
 * helper to bootstrap default values.
 */

import { put } from "@vercel/blob";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

interface AssetSpec {
  label: string;
  source: string;
  blobPath: string;
  contentType: string;
}

const ASSETS: AssetSpec[] = [
  {
    label: "SIGNATURE_LOGO_URL",
    source: path.join(os.homedir(), "Desktop", "Optimise-Digital-Logo-rocket-animation.gif"),
    blobPath: "email-signatures/optimise-digital-logo-rocket-animation.gif",
    contentType: "image/gif",
  },
  {
    label: "SIGNATURE_GOOGLE_BADGE_URL",
    source: path.join(os.homedir(), "Desktop", "google-partner.png"),
    blobPath: "email-signatures/google-partner.png",
    contentType: "image/png",
  },
  {
    label: "SIGNATURE_META_BADGE_URL",
    source: path.join(os.homedir(), "Desktop", "meta-partner.png"),
    blobPath: "email-signatures/meta-partner.png",
    contentType: "image/png",
  },
];

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN not set in env");
    process.exit(1);
  }
  for (const asset of ASSETS) {
    const buf = await readFile(asset.source);
    const result = await put(asset.blobPath, buf, {
      access: "public",
      contentType: asset.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log(`${asset.label}=${result.url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
