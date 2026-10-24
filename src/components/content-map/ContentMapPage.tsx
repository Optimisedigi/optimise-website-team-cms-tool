"use client";

import { ContentMapShell, type Audience } from "./ContentMapShell";

/** Height of the "Managed by" bar under the full-page map. */
export const BADGE_H = 40;

/** Full-window Content Map for /SEO/Topic-association-linking/<client-slug>, signed off like the other reports. */
export default function ContentMapPage({ clientId, slug, audience, staff = false }: { clientId: string; slug: string; audience: Audience; staff?: boolean }) {
  return (
    <div style={{ background: "oklch(0.975 0.005 85)", minHeight: "100vh" }}>
      <ContentMapShell clientId={clientId} slug={slug} variant="page" audience={audience} staff={staff} />
      {/* "Managed by" sign-off with the animated Optimise Digital logo, as on the
          Google Ads dashboard. The map is sized to leave room for it, so it's
          always in view at the bottom of the window. */}
      <div style={{ height: BADGE_H, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "0 24px", borderTop: "1px solid oklch(0.9 0.006 85)", background: "oklch(0.995 0.002 85)" }}>
        <span style={{ fontSize: 12, color: "oklch(0.52 0.01 85)", fontFamily: "'Instrument Sans', sans-serif" }}>Managed by</span>
        <img src="/optimise-logo-animated.gif" alt="Optimise Digital" style={{ display: "block", height: 15, width: "auto", mixBlendMode: "multiply" }} />
      </div>
    </div>
  );
}
