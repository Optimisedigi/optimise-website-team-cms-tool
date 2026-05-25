import type { PayloadRequest, ServerProps, NavPreferences } from "payload";

import { DefaultNav } from "@payloadcms/next/rsc";

type DefaultOpenClientsNavProps = ServerProps & {
  req?: PayloadRequest;
};

const CLIENTS_GROUP_LABEL = "Clients";

export async function DefaultOpenClientsNav(props: DefaultOpenClientsNavProps) {
  const user = props.req?.user;

  if (props.req?.payload && user?.collection && user.id) {
    const preferences = await props.req.payload.find({
      collection: "payload-preferences",
      depth: 0,
      limit: 1,
      pagination: false,
      req: props.req,
      where: {
        and: [
          { key: { equals: "nav" } },
          { "user.relationTo": { equals: user.collection } },
          { "user.value": { equals: user.id } },
        ],
      },
    });

    const navPreference = preferences.docs[0];
    const navValue = navPreference?.value as NavPreferences | undefined;

    if (navPreference && navValue && navValue.groups?.[CLIENTS_GROUP_LABEL]?.open !== true) {
      await props.req.payload.update({
        id: navPreference.id,
        collection: "payload-preferences",
        data: {
          value: {
            ...navValue,
            groups: {
              ...(navValue.groups ?? {}),
              [CLIENTS_GROUP_LABEL]: {
                ...(navValue.groups?.[CLIENTS_GROUP_LABEL] ?? {}),
                open: true,
              },
            },
          },
        },
        req: props.req,
      });
    }
  }

  return DefaultNav(props);
}

export default DefaultOpenClientsNav;
