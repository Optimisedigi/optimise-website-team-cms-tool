import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import ContractorPortal from "@/components/ContractorPortal";

/**
 * Public contractor portal. Token in the URL identifies the contractor.
 * No login or PIN — the token is the credential. Page never exposes
 * money values, only hours.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "contractors",
    where: { portalToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const contractor = result.docs[0] as any;
  if (!contractor || !contractor.isActive) notFound();

  return (
    <ContractorPortal
      token={token}
      contractorId={Number(contractor.id)}
      contractorName={String(contractor.name || "Contractor")}
      defaultWeeklyHours={Number(contractor.defaultWeeklyHours || 16)}
    />
  );
}
