"use client";

/**
 * Tags <body> with `role-admin` / `role-non-admin` so CSS can show/hide
 * elements based on the current user's role.
 *
 * Used (in custom.scss) to hide the API tab on document edit views for
 * non-admins. The API tab is built into Payload core and there's no
 * per-user config for it, so we hide it client-side via CSS.
 */

import { useEffect } from "react";
import { useAuth } from "@payloadcms/ui";

const RoleBodyClass = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();

  useEffect(() => {
    const u = user as { role?: string } | null | undefined;
    const isAdmin = u?.role === "admin";
    const body = document.body;
    body.classList.toggle("role-admin", !!u && isAdmin);
    body.classList.toggle("role-non-admin", !!u && !isAdmin);
    body.classList.toggle("role-unknown", !u);
  }, [user]);

  return <>{children}</>;
};

export default RoleBodyClass;
