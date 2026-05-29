"use client";

import React from "react";
import { useFormFields } from "@payloadcms/ui";

export default function ViewClientHubLink(): React.ReactElement | null {
  const slug = useFormFields(([fields]) => fields.slug?.value);
  if (!slug || typeof slug !== "string") return null;
  return (
    <div style={{ padding: "8px 0" }}>
      <a href={`/client/${slug}/hub`} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
        View Client Hub ↗
      </a>
    </div>
  );
}
