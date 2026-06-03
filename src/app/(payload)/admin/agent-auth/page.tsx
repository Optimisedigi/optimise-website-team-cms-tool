/**
 * Agent auth page (server shell).
 *
 * Authenticates the CMS user, then renders the client-bodied AgentAuthPage
 * inside the Payload admin shell (sidebar + header). The agent-auth API
 * endpoints enforce a logged-in user on every call too.
 */

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload, createLocalReq } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";
import config from "@/payload.config";
import AgentAuthPage from "@/components/AgentAuthPage";
import { getVisibleEntities, getCustomViewActions } from "@/lib/visible-entities";
import AdminStepNavSetter from "@/components/AdminStepNavSetter";

export const dynamic = "force-dynamic";

export default async function Page() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { permissions, user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect(`/admin/login?redirect=/admin/agent-auth`);
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
      <AdminStepNavSetter items={[{ label: "Agent Auth" }]} />
      <div className="gutter--left gutter--right">
        <AgentAuthPage />
      </div>
    </DefaultTemplate>
  );
}
