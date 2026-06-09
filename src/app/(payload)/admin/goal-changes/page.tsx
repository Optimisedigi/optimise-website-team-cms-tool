/**
 * Read-only Change-Review page for goal-agent runs, rendered inside the Payload
 * admin shell. Surfaces approved changes by default with a toggle for
 * disapproved/blocked changes, each with the reason it was flagged. Scope it
 * with ?clientId= or ?goalRunId=. No mutation surface — reads existing audit
 * data via /api/goal-agents/changes.
 */
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload, createLocalReq } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";

import config from "@/payload.config";
import { getVisibleEntities, getCustomViewActions } from "@/lib/visible-entities";
import AdminStepNavSetter from "@/components/AdminStepNavSetter";
import GoalChangeReview from "@/components/GoalChangeReview";

export const dynamic = "force-dynamic";

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  maxWidth: 980,
  margin: "0 auto",
  padding: "24px 0 40px",
  color: "var(--theme-elevation-900, #222)",
};

export default async function GoalChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; goalRunId?: string }>;
}) {
  const { clientId, goalRunId } = await searchParams;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { permissions, user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect("/admin/login?redirect=/admin/goal-changes");
  }

  const req = await createLocalReq({ user: user ?? undefined }, payload);

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user ?? undefined}
      viewActions={getCustomViewActions(payload)}
      visibleEntities={getVisibleEntities(payload, user)}
    >
      <AdminStepNavSetter items={[{ label: "Goal Changes" }]} />
      <div className="gutter--left gutter--right">
        <div style={PAGE_STYLE}>
          <h1 style={{ fontSize: 22, marginTop: 0, marginBottom: 4 }}>Goal-agent change review</h1>
          <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 20 }}>
            Approved changes are shown by default. Toggle to reveal disapproved or
            blocked changes with the reason each was flagged.
            {!clientId && !goalRunId && " Pass ?clientId= or ?goalRunId= to scope."}
          </p>
          {clientId || goalRunId ? (
            <GoalChangeReview clientId={clientId} goalRunId={goalRunId} />
          ) : (
            <p style={{ color: "#991b1b" }}>
              Provide a <code>clientId</code> or <code>goalRunId</code> query parameter.
            </p>
          )}
        </div>
      </div>
    </DefaultTemplate>
  );
}
