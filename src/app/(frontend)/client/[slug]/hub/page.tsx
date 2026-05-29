import React from "react";
import { ClientHubClient } from "./ClientHubClient";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<{ title: string; robots: { index: boolean; follow: boolean } }> {
  const { slug } = await params;
  return { title: `Client Hub · ${slug}`, robots: { index: false, follow: false } };
}

export default async function ClientHubPage({ params }: { params: Promise<{ slug: string }> }): Promise<React.ReactElement> {
  const { slug } = await params;
  return <ClientHubClient slug={slug} />;
}
