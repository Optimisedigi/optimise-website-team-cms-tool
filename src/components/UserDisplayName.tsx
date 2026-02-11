"use client";
import { useAuth } from "@payloadcms/ui";

const UserDisplayName = () => {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <span style={{ fontSize: 13, color: "var(--theme-elevation-800)", whiteSpace: "nowrap" }}>
      {(user as any).name || (user as any).email}
    </span>
  );
};
export default UserDisplayName;
