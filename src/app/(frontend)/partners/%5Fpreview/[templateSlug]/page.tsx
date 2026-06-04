import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPayload } from "payload";
import configPromise from "@/payload.config";
import { getTemplate } from "@/lib/decks/registry";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deck Template Preview",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateSlug: string }>;
  searchParams: Promise<{ data?: string }>;
}) {
  const { templateSlug } = await params;
  const { data: encoded } = await searchParams;

  // Admin gate: require an active Payload admin session.
  const payload = await getPayload({ config: configPromise });
  const reqHeaders = await headers();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#444" }}>
        <h1>Unauthorized</h1>
        <p>Sign in to the CMS admin to preview deck templates.</p>
      </div>
    );
  }

  const template = getTemplate(templateSlug);
  if (!template || template.kind !== "live") {
    notFound();
  }

  let payloadData = template.samplePayload;
  if (encoded) {
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded) as unknown;
      payloadData = template.payloadSchema.parse(parsed);
    } catch (err) {
      return (
        <div style={{ padding: 40, fontFamily: "system-ui", color: "#b91c1c" }}>
          <h1>Invalid payload</h1>
          <p>Could not decode/validate the `data` query string:</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {err instanceof Error ? err.message : String(err)}
          </pre>
        </div>
      );
    }
  }

  const Component = template.Component;
  return <Component payload={payloadData} />;
}
