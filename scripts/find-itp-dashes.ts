import { getPayload } from "payload";
import payloadConfig from "../src/payload.config";

function findDashes(obj: unknown, path: string, out: Array<[string, string]>) {
  if (obj == null) return;
  if (typeof obj === "string") {
    if (/[\u2014\u2013]/.test(obj)) out.push([path, obj]);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findDashes(v, `${path}[${i}]`, out));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      findDashes(v, path ? `${path}.${k}` : k, out);
    }
  }
}

async function main() {
  const payload = await getPayload({ config: payloadConfig });
  const r = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: "in-the-picture" } },
    depth: 2, limit: 1, overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = r.docs[0] as any;
  if (!p) { console.error("not found"); process.exit(1); }
  const out: Array<[string, string]> = [];
  findDashes(p, "", out);
  console.log(`Found ${out.length} string field(s) containing en/em dashes:\n`);
  for (const [path, val] of out) {
    console.log(`  ${path}`);
    console.log(`    ${val.length > 200 ? val.slice(0, 200) + "..." : val}\n`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
