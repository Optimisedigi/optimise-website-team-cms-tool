import type { EntityToGroup } from "@payloadcms/ui/shared";
import type { NavPreferences, PayloadRequest, ServerProps } from "payload";

import { Logout } from "@payloadcms/ui";
import { RenderServerComponent } from "@payloadcms/ui/elements/RenderServerComponent";
import { DefaultNavClient, NavHamburger, NavWrapper } from "@payloadcms/next/client";
import { EntityType, groupNavItems } from "@payloadcms/ui/shared";

const BASE_CLASS = "nav";
const CLIENTS_GROUP_LABEL = "Clients";

type DefaultOpenClientsNavProps = ServerProps & {
  req?: PayloadRequest;
};

function getClientsOpenNavPreferences(navPreferences: NavPreferences | null): NavPreferences {
  return {
    ...(navPreferences ?? {}),
    groups: {
      ...(navPreferences?.groups ?? {}),
      [CLIENTS_GROUP_LABEL]: {
        ...(navPreferences?.groups?.[CLIENTS_GROUP_LABEL] ?? {}),
        open: true,
      },
    },
    open: navPreferences?.open ?? true,
  };
}

async function getNavPreferences(req: PayloadRequest | undefined): Promise<NavPreferences | null> {
  if (!req?.user?.collection) {
    return null;
  }

  const preferences = await req.payload.find({
    collection: "payload-preferences",
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        { key: { equals: "nav" } },
        { "user.relationTo": { equals: req.user.collection } },
        { "user.value": { equals: req.user.id } },
      ],
    },
  });

  return (preferences.docs[0]?.value as NavPreferences | undefined) ?? null;
}

export async function DefaultOpenClientsNav(props: DefaultOpenClientsNavProps) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props;

  if (!payload?.config || !visibleEntities || !permissions) {
    return null;
  }

  const {
    admin: {
      components: { afterNav, afterNavLinks, beforeNav, beforeNavLinks, logout, settingsMenu },
    },
    collections,
    globals,
  } = payload.config;

  const groups = groupNavItems(
    [
      ...collections
        .filter(({ slug }) => visibleEntities.collections.includes(slug))
        .map(
          (collection) =>
            ({ type: EntityType.collection, entity: collection }) satisfies EntityToGroup,
        ),
      ...globals
        .filter(({ slug }) => visibleEntities.globals.includes(slug))
        .map((global) => ({ type: EntityType.global, entity: global }) satisfies EntityToGroup),
    ],
    permissions,
    i18n,
  );

  const navPreferences = getClientsOpenNavPreferences(await getNavPreferences(req));

  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    user,
  };

  const clientProps = { documentSubViewType, viewType };

  const LogoutComponent = RenderServerComponent({
    clientProps,
    Component: logout?.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedSettingsMenu = settingsMenu && Array.isArray(settingsMenu)
    ? settingsMenu.map((item, index) =>
        RenderServerComponent({
          clientProps,
          Component: item,
          importMap: payload.importMap,
          key: `settings-menu-item-${index}`,
          serverProps,
        }),
      )
    : [];

  const RenderedBeforeNav = RenderServerComponent({
    clientProps,
    Component: beforeNav,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedBeforeNavLinks = RenderServerComponent({
    clientProps,
    Component: beforeNavLinks,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedAfterNavLinks = RenderServerComponent({
    clientProps,
    Component: afterNavLinks,
    importMap: payload.importMap,
    serverProps,
  });

  const RenderedAfterNav = RenderServerComponent({
    clientProps,
    Component: afterNav,
    importMap: payload.importMap,
    serverProps,
  });

  return (
    <NavWrapper baseClass={BASE_CLASS}>
      {RenderedBeforeNav}
      <nav className={`${BASE_CLASS}__wrap`}>
        {RenderedBeforeNavLinks}
        <DefaultNavClient groups={groups} navPreferences={navPreferences} />
        {RenderedAfterNavLinks}
        <div className={`${BASE_CLASS}__controls`}>{LogoutComponent}</div>
      </nav>
      {RenderedAfterNav}
      <div className={`${BASE_CLASS}__header`}>
        <div className={`${BASE_CLASS}__header-content`}>
          <NavHamburger baseClass={BASE_CLASS} />
        </div>
      </div>
    </NavWrapper>
  );
}

export default DefaultOpenClientsNav;
