"use client";

import React from "react";
import { useDocumentInfo, useFormFields } from "@payloadcms/ui";

function adminCreateHref(collection: string, clientId: string | number): string {
  return `/admin/collections/${collection}/create?client=${encodeURIComponent(String(clientId))}`;
}

export default function ClientGrowthHubAdminActions(): React.ReactElement | null {
  const { id: clientId } = useDocumentInfo();
  const slug = useFormFields(([fields]) => fields.slug?.value);
  if (!clientId) return null;

  const links = [
    { label: "Add forecast scenario", href: adminCreateHref("forecast-scenarios", clientId) },
    { label: "Add value ledger item", href: adminCreateHref("client-value-ledger-items", clientId) },
    { label: "Add portal request", href: adminCreateHref("client-portal-requests", clientId) },
    { label: "View organic snapshots", href: `/admin/collections/quarterly-organic-growth-snapshots?where[client][equals]=${encodeURIComponent(String(clientId))}` },
  ];

  return (
    <div style={{ padding: "12px 0", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              border: "1px solid var(--theme-elevation-150)",
              borderRadius: 8,
              padding: "8px 10px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
      {typeof slug === "string" && slug ? (
        <p style={{ margin: 0, color: "var(--theme-elevation-600)", fontSize: 13 }}>
          Public hub path: <code>/client/{slug}/hub</code>
        </p>
      ) : null}
    </div>
  );
}
