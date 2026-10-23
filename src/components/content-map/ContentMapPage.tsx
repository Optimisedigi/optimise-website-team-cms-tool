"use client";

import { ContentMapShell, type Audience } from "./ContentMapShell";

/** Full-window Content Map for /SEO/Topic-association-linking/<client-slug>, signed off like the other reports. */
export default function ContentMapPage({ clientId, slug, audience, staff = false }: { clientId: string; slug: string; audience: Audience; staff?: boolean }) {
  return (
    <div style={{ background: "oklch(0.975 0.005 85)", minHeight: "100vh" }}>
      <ContentMapShell clientId={clientId} slug={slug} variant="page" audience={audience} staff={staff} />
      {/* Brand sign-off at the end of the document, as on the other client reports. */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "18px 24px 28px" }}>
        <img src="/optimise-digital-logo-black.webp" alt="" aria-hidden="true" width={150} height={Math.round((150 * 151) / 1068)} style={{ display: "block", width: 150, height: "auto", opacity: 0.7 }} />
      </div>
    </div>
  );
}
