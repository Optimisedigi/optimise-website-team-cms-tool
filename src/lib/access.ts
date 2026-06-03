/**
 * Centralized access control helpers.
 *
 * Rules:
 * - Admins always pass everything (read/create/update/delete).
 * - Non-admins (manager/specialist) can never delete.
 * - Non-admins can only read/create/update collections / globals / nav items
 *   whose feature key appears in their EFFECTIVE feature set.
 *
 * Effective feature set = (per-user `featureAccess`) ∪ (features inherited from
 * any assigned `permissionProfiles`). Profiles are added/managed in the
 * Permission Profiles collection. Per-user list and profiles are additive —
 * neither removes from the other.
 */

import type { Access, FieldAccess } from "payload";

/**
 * Master list of feature keys.
 *
 * Used both as:
 *  - the options for the multi-select on Users (per-user overrides) and
 *    Permission Profiles (profile-level grants), and
 *  - the keys passed to `canAccess()` / global access fns / nav gating.
 *
 * Values fall into three groups:
 *  1. Collection slugs (e.g. "blog-posts")
 *  2. Global slugs    (e.g. "email-templates")
 *  3. Custom nav items, prefixed `nav:` to keep them distinct from real
 *     collection/global slugs (e.g. "nav:google-analytics")
 */
export const FEATURE_KEYS = [
  // Clients
  { label: "Clients", value: "clients" },
  { label: "Client Proposals", value: "client-proposals" },
  { label: "Contracts", value: "contracts" },
  { label: "Sales Leads", value: "sales-leads" },
  { label: "Process Templates", value: "process-templates" },
  { label: "Deck Templates", value: "deck-templates" },
  { label: "Client Processes", value: "client-processes" },
  { label: "Meeting Schedulers", value: "meeting-schedulers" },
  { label: "Email Templates (Global)", value: "email-templates" },
  // Auto-grants — read-only access to non-sensitive client/media fields,
  // automatically added when a user has any feature that references clients
  // or media as relationships. Admins can also tick these explicitly.
  { label: "Clients (read-only basic info)", value: "clients-basic" },
  { label: "Media (read-only basic info)", value: "media-basic" },
  // Content
  { label: "Blog Posts", value: "blog-posts" },
  { label: "Blog Prompts", value: "blog-prompts" },
  { label: "Blog Settings (Global)", value: "blog-settings" },
  { label: "Job Posts", value: "job-posts" },
  { label: "Media", value: "media" },
  // SEO
  { label: "Internal Link Suggestions", value: "internal-link-suggestions" },
  // Audits
  { label: "SEO Audits", value: "seo-audits" },
  { label: "SEO Audit Proposals", value: "seo-audit-proposals" },
  { label: "CRO Audits", value: "cro-audits" },
  { label: "Google Ads Audits", value: "google-ads-audits" },
  { label: "Tag Setup Audits", value: "tag-setup-audits" },
  { label: "Keyword Snapshots", value: "keyword-snapshots" },
  { label: "Competitor Analyses", value: "competitor-analyses" },
  { label: "Content Researches", value: "content-researches" },
  { label: "GSC Alerts", value: "gsc-alerts" },
  { label: "GSC Indexing Audits", value: "gsc-indexing-audits" },
  { label: "Post-Migration SEO Reviews", value: "seo-migration-checks" },
  { label: "Negative Keyword Lists", value: "negative-keyword-lists" },
  { label: "Negative Keyword Submits", value: "keyword-deep-dive-sessions" },
  { label: "Site Health Reports", value: "site-health-reports" },
  // Reports
  { label: "Agency KPI Snapshots", value: "agency-kpi-snapshots" },
  { label: "AI Visibility", value: "ai-visibility-snapshots" },
  { label: "SERP Displacement", value: "serp-displacement-snapshots" },
  { label: "SERP Displacement Alerts", value: "serp-displacement-alerts" },
  // Finance
  { label: "Business Costs", value: "business-costs" },
  { label: "Cost Categories", value: "cost-categories" },
  { label: "Cost Rules", value: "cost-rules" },
  { label: "API Cost Rates (Global)", value: "api-cost-rates" },
  { label: "Invoices (Xero)", value: "nav:invoices" },
  { label: "Contractors", value: "contractors" },
  { label: "Contractor Costs (page)", value: "nav:contractor-costs" },
  // Performance
  { label: "Google Analytics", value: "nav:google-analytics" },
  { label: "Search Console", value: "nav:search-console" },
  { label: "Deployments", value: "nav:deployments" },
  { label: "Google Ads (hub)", value: "nav:google-ads" },
  { label: "SEO (hub)", value: "nav:seo" },
  // Settings
  { label: "Integrations", value: "nav:integrations" },
  { label: "Indexing Helper", value: "nav:indexing-helper" },
  { label: "Google Sheets Auth (Global)", value: "sheets-auth" },
  { label: "Google Calendar Auth (Global)", value: "calendar-auth" },
  { label: "Cron Settings (Global)", value: "cron-settings" },
  { label: "OptiMate Settings (Global)", value: "optimate-settings" },
  // Admin
  { label: "Dashboard (Agency)", value: "nav:dashboard" },
  { label: "Usage Reports", value: "usage-reports" },
] as const;

export type FeatureSlug = (typeof FEATURE_KEYS)[number]["value"];

/**
 * Features whose presence implies the user needs to read CLIENT names and
 * basic identity (e.g. blog posts have a client relationship; the picker
 * needs to render "Acme Corp" instead of "Untitled — ID: 1").
 *
 * Anyone with one of these features automatically also has `clients-basic`.
 */
export const AUTO_GRANT_CLIENTS_BASIC_TRIGGERS: readonly FeatureSlug[] = [
  "clients", // full clients implies basic
  "client-proposals",
  "contracts",
  "sales-leads",
  "client-processes",
  "process-templates",
  "meeting-schedulers",
  "blog-posts",
  "blog-prompts",
  "job-posts",
  "internal-link-suggestions",
  "seo-audits",
  "seo-audit-proposals",
  "cro-audits",
  "google-ads-audits",
  "tag-setup-audits",
  "keyword-snapshots",
  "competitor-analyses",
  "content-researches",
  "gsc-alerts",
  "gsc-indexing-audits",
  "seo-migration-checks",
  "negative-keyword-lists",
  "nav:google-ads",
  "nav:seo",
  "site-health-reports",
  "ai-visibility-snapshots",
  "serp-displacement-snapshots",
  "serp-displacement-alerts",
] as const;

/**
 * Features whose presence implies the user needs to read MEDIA basics
 * (cover images, author photos, etc. — anywhere a Media relationship is
 * rendered as a thumbnail/URL).
 *
 * Anyone with one of these features automatically also has `media-basic`.
 */
export const AUTO_GRANT_MEDIA_BASIC_TRIGGERS: readonly FeatureSlug[] = [
  "media", // full media implies basic
  "blog-posts",
  "blog-prompts",
  "clients", // author photos
  "clients-basic", // author photos for basic clients access
  "contracts", // contract uploads
  "job-posts",
] as const;

/**
 * For a given set of explicitly-granted features, return the set of features
 * that get auto-granted. Used by:
 *  - access checks at runtime
 *  - the FeatureAccessPicker UI to show ticked + disabled boxes
 */
export function computeAutoGrants(explicit: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const trigger of AUTO_GRANT_CLIENTS_BASIC_TRIGGERS) {
    if (explicit.has(trigger)) {
      out.add("clients-basic");
      break;
    }
  }
  for (const trigger of AUTO_GRANT_MEDIA_BASIC_TRIGGERS) {
    if (explicit.has(trigger)) {
      out.add("media-basic");
      break;
    }
  }
  return out;
}

/** True if the request user is an admin. Exported so route handlers can
 *  gate destructive endpoints (e.g. agent-approval apply/approve) on admin
 *  role without re-implementing the check. */
export function isAdmin(user: any): boolean {
  return user?.role === "admin";
}

/**
 * Compute the effective feature set for a user as a Set<string>.
 *
 * Effective = per-user `featureAccess` ∪ each assigned profile's `features`.
 *
 * Profiles may be either:
 *  - populated objects (depth >= 1) with a `features` array, or
 *  - bare ids (depth = 0) which contribute nothing on their own.
 *
 * Hooks/access functions and the SidebarNavExtras client component should
 * therefore make sure they fetch the user with depth >= 1 (which is what
 * `payload.auth()` does by default).
 */
export function getEffectiveFeatures(user: any): Set<string> {
  const explicit = new Set<string>();
  if (!user) return explicit;
  const own = Array.isArray(user.featureAccess) ? user.featureAccess : [];
  for (const f of own) if (typeof f === "string") explicit.add(f);
  const profiles = Array.isArray(user.permissionProfiles)
    ? user.permissionProfiles
    : [];
  for (const p of profiles) {
    if (p && typeof p === "object" && Array.isArray(p.features)) {
      for (const f of p.features) if (typeof f === "string") explicit.add(f);
    }
  }
  // Layer auto-grants on top of explicit grants.
  const out = new Set<string>(explicit);
  for (const auto of computeAutoGrants(explicit)) out.add(auto);
  return out;
}

/** True if a non-admin user has the given slug in their effective feature set. */
function hasFeature(user: any, slug: string): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return getEffectiveFeatures(user).has(slug);
}

/** Public version for use in client components and other helpers. */
export function userHasFeature(user: any, slug: FeatureSlug | string): boolean {
  return hasFeature(user, slug);
}

/**
 * Read/create/update access for a collection.
 * Admin: always allowed.
 * Non-admin: allowed only if the slug is in their featureAccess.
 * Unauthenticated: denied.
 */
export function canAccess(slug: FeatureSlug): Access {
  return ({ req }) => {
    if (!req.user) return false;
    return hasFeature(req.user, slug);
  };
}

/**
 * Read access that passes if the user has ANY of the listed slugs. Used for
 * collections like Clients/Media where read is granted by either the full
 * feature OR the auto-granted `*-basic` feature.
 */
export function canAccessAny(...slugs: FeatureSlug[]): Access {
  return ({ req }) => {
    if (!req.user) return false;
    if (isAdmin(req.user)) return true;
    const features = getEffectiveFeatures(req.user);
    return slugs.some((s) => features.has(s));
  };
}

/**
 * Field-level read access gated by a feature slug. Returns true if the user
 * has the feature in their effective set (admins always pass).
 *
 * Used in Clients.ts to gate sensitive fields behind full `clients` access
 * while still allowing `clients-basic` users to read the doc.
 */
export function fieldReadIfFeature(slug: FeatureSlug): FieldAccess {
  return ({ req }) => {
    if (!req.user) return false;
    return hasFeature(req.user, slug);
  };
}

/**
 * Returns an `admin.condition` function that hides a field unless the user
 * has the given feature. Combine with field-level access (read/update/create)
 * to fully gate a sensitive field.
 *
 * The returned condition wraps any existing user-supplied condition: both
 * must pass for the field to render.
 */
export function conditionRequiresFeature(
  slug: FeatureSlug,
  existing?: (data: any, siblingData: any, ctx: { user: any }) => boolean,
) {
  return (data: any, siblingData: any, ctx: { user: any }) => {
    if (!ctx?.user) return false;
    if (!hasFeature(ctx.user, slug)) return false;
    return existing ? existing(data, siblingData, ctx) : true;
  };
}

/**
 * Field-level access block: read/update/create all gated by the slug.
 * Spread into the field's `access` key.
 */
export function sensitiveFieldAccess(slug: FeatureSlug) {
  return {
    read: fieldReadIfFeature(slug),
    update: fieldReadIfFeature(slug),
    create: fieldReadIfFeature(slug),
  };
}

/**
 * Read/create/update access for a collection that ALSO allows external
 * services (Growth Tools etc.) to access via the x-api-key header.
 */
export function canAccessOrApiKey(
  slug: FeatureSlug,
  hasValidApiKey: (req: any) => boolean,
): Access {
  return ({ req }) => {
    if (hasValidApiKey(req)) return true;
    if (!req.user) return false;
    return hasFeature(req.user, slug);
  };
}

/**
 * Same as `canAccessAny` but with an API-key fallback. Lets internal services
 * (Growth Tools, the Optimate agents) read docs without a logged-in user
 * session by sending `x-api-key: AUDIT_API_KEY`.
 */
export function canAccessAnyOrApiKey(
  hasValidApiKey: (req: any) => boolean,
  ...slugs: FeatureSlug[]
): Access {
  return ({ req }) => {
    if (hasValidApiKey(req)) return true;
    if (!req.user) return false;
    if (isAdmin(req.user)) return true;
    const features = getEffectiveFeatures(req.user);
    return slugs.some((s) => features.has(s));
  };
}

/**
 * Admin-only access. Used as the default for `delete` on every collection
 * (delete is admin-only across the board) and for `update` on every Global
 * (globals like API Cost Rates and Email Templates only admins can edit).
 */
export const adminOnlyAccess: Access = ({ req }) => {
  if (!req.user) return false;
  return isAdmin(req.user);
};

/** @deprecated use `adminOnlyAccess` — same fn, clearer name. */
export const adminOnlyDelete = adminOnlyAccess;

/**
 * Field-level access — admin only. Used for sensitive fields like role
 * and featureAccess on the Users collection.
 */
export const adminOnlyField: FieldAccess = ({ req }) => isAdmin(req.user);

/**
 * Hide a collection or global from the admin sidebar for users that lack
 * the feature. Admins always see everything.
 */
export function hideUnlessFeature(slug: FeatureSlug) {
  return ({ user }: { user: any }) => {
    if (!user) return true;
    return !hasFeature(user, slug);
  };
}

/**
 * Convenience: build the standard `access` block for a Global, gated by a
 * feature key. Read = anyone with the feature. Update = admin only.
 */
export function globalAccess(slug: FeatureSlug) {
  return {
    read: (({ req }: { req: any }) => {
      if (!req.user) return false;
      return hasFeature(req.user, slug);
    }) as Access,
    update: adminOnlyAccess,
  };
}

/**
 * Convenience: build the `admin.hidden` fn for a Global, gated by a feature
 * key. Globals don't accept the same fn signature as collections so this
 * matches what Payload expects for global `admin.hidden`.
 */
export function hideGlobalUnlessFeature(slug: FeatureSlug) {
  return ({ user }: { user: any }) => {
    if (!user) return true;
    return !hasFeature(user, slug);
  };
}
