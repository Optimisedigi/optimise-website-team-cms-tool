import type { AdminViewServerProps } from "payload";
import { redirect } from "next/navigation";
import { formatAdminURL, getSafeRedirect } from "payload/shared";
import { CountdownLoginForm } from "./CountdownLoginForm";

/**
 * Replaces Payload's default `/admin/login` view (registered as
 * `admin.components.views.login`) with the Concept 4 "Countdown" design.
 *
 * Mirrors Payload's own LoginView so auth behaviour is unchanged: signed-in
 * users are sent straight to the safe `?redirect=` target (falling back to
 * the admin root), and the form posts to the users collection's REST login
 * endpoint, which sets the same `payload-token` cookie.
 */
export function CountdownLoginView({ initPageResult, searchParams }: AdminViewServerProps) {
  const {
    req: {
      payload: { config },
      user,
    },
  } = initPageResult;
  const {
    admin: {
      routes: { forgot: forgotRoute },
      user: userSlug,
    },
    routes: { admin: adminRoute, api: apiRoute },
  } = config;

  const redirectTo = getSafeRedirect({
    fallbackTo: adminRoute,
    redirectTo: searchParams?.redirect ?? "",
  });

  if (user) {
    redirect(redirectTo);
  }

  return (
    <CountdownLoginForm
      forgotPasswordUrl={formatAdminURL({ adminRoute, path: forgotRoute })}
      loginUrl={formatAdminURL({ apiRoute, path: `/${userSlug}/login` })}
      redirectTo={redirectTo}
    />
  );
}
