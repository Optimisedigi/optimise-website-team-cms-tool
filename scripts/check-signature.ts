import { getPayload } from "payload";
import config from "../src/payload.config";

async function main() {
  const payload = await getPayload({ config });
  const global = (await payload.findGlobal({
    slug: "email-templates" as never,
    overrideAccess: true,
  })) as any;
  const html: string = global.signatureHtml ?? "";
  const match = html.match(/padding:0 (\d+)px 8px 0/);
  console.log("padding-right currently in live global:", match?.[1] ?? "(not found)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
