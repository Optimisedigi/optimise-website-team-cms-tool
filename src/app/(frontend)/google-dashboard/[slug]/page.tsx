import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { DashboardClient } from "./DashboardClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GoogleDashboardPage({ params }: Props) {
  const { slug } = await params;

  // Validate that a client with this slug exists and has Google Ads configured
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const clientResult = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      name: true,
      clientPin: true,
      googleAdsCustomerId: true,
    },
  });

  const client = clientResult.docs[0] as any;
  if (!client || !client.googleAdsCustomerId) {
    notFound();
  }

  // Check if user has a valid dashboard session
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("dashboard_token")?.value;
  const isAuthenticated = tokenCookie?.startsWith(`${slug}:`) ?? false;

  return <DashboardClient slug={slug} clientName={client.name} isAuthenticated={isAuthenticated} />;
}
