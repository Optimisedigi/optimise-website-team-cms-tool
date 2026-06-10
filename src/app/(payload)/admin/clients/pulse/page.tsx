import config from "@payload-config";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { headers as getHeaders } from "next/headers";
import { createLocalReq, getPayload } from "payload";
import { redirect } from "next/navigation";
import AdminStepNavSetter from "../../../../../components/AdminStepNavSetter";
import ClientPulsePage from "../../../../../components/ClientPulsePage";
import { getClientPulseSummaries } from "../../../../../lib/client-pulse";
import { getCustomViewActions, getVisibleEntities } from "../../../../../lib/visible-entities";

export default async function Page() {
  const payload = await getPayload({ config });
  const headers = await getHeaders();
  const { permissions, user } = await payload.auth({ headers });
  if (!user) {
    redirect("/admin/login");
  }
  const req = await createLocalReq({ user }, payload);
  const visibleEntities = getVisibleEntities(payload, user);
  const viewActions = getCustomViewActions(payload);
  const summaries = await getClientPulseSummaries(payload);

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user}
      viewActions={viewActions}
      visibleEntities={visibleEntities}
    >
      <AdminStepNavSetter items={[{ label: "Clients" }, { label: "Client Pulse" }]} />
      <div className="gutter--left gutter--right" style={{ maxWidth: 1480 }}>
        <ClientPulsePage initialData={summaries} />
      </div>
    </DefaultTemplate>
  );
}
