import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";
import { DEFAULT_VERCEL_PROJECT, isValidHostname } from "../lib/vercel-domains";

/**
 * Custom-domain mappings for landing properties.
 *
 * One row per hostname attached to the landing Vercel project. The row caches
 * the DNS record the client must create (project-specific CNAME target — the
 * generic `cname.vercel-dns.com` fails verification on newer projects) so the
 * instructions email can be regenerated without another Vercel call, plus the
 * TXT verification challenge Vercel issues when the apex belongs to another
 * Vercel account.
 *
 * Rows are normally written by the `/api/landing-admin/domains` routes, which
 * also flip `status` to `live` and append `https://{hostname}` to the owning
 * property's `allowedOrigins` once Vercel confirms DNS — the manual origin
 * step this feature exists to eliminate.
 */
export const LandingDomains: CollectionConfig = {
  slug: "landing-domains",
  labels: { singular: "Landing Domain", plural: "Landing Domains" },
  admin: {
    useAsTitle: "hostname",
    group: "Reports",
    description:
      "Custom hostnames mapped onto the landing Vercel project, with cached DNS instructions and live-check status.",
    defaultColumns: ["hostname", "property", "status", "lastCheckedAt"],
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  fields: [
    { name: "property", type: "relationship", relationTo: "landing-properties", required: true, index: true },
    {
      name: "hostname",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        value && isValidHostname(value)
          ? true
          : "Must be a bare lowercase hostname like hire.example.com — no scheme, path or wildcard.",
      admin: { description: "Exact hostname, e.g. hire.awaydigitalteams.com. No wildcards." },
    },
    {
      name: "vercelProjectId",
      type: "text",
      required: true,
      defaultValue: DEFAULT_VERCEL_PROJECT,
      admin: { description: "Vercel project the hostname is attached to." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending-dns",
      index: true,
      options: [
        { label: "Waiting on client DNS", value: "pending-dns" },
        { label: "DNS set, SSL provisioning", value: "pending-ssl" },
        { label: "Live", value: "live" },
        { label: "Error", value: "error" },
      ],
    },
    {
      name: "dnsRecordType",
      type: "text",
      admin: { description: "Record type the client must create (normally CNAME)." },
    },
    { name: "dnsRecordName", type: "text", admin: { description: "Record name/host, e.g. `hire`." } },
    {
      name: "dnsRecordValue",
      type: "text",
      admin: {
        description:
          "Exact record value from Vercel (project-specific, e.g. 9d3f…vercel-dns-016.com). Never substitute the generic cname.vercel-dns.com.",
      },
    },
    {
      name: "verificationTxt",
      type: "text",
      admin: {
        description:
          "TXT challenge value when the domain belongs to another Vercel account; empty otherwise.",
      },
    },
    { name: "lastCheckedAt", type: "date" },
    {
      name: "pathHint",
      type: "text",
      admin: {
        description:
          "Display-only hint of which page the domain fronts (e.g. /outsourcing-au). Origins are host-scoped, so this has no effect on auth.",
      },
    },
    {
      name: "auditLog",
      type: "textarea",
      admin: {
        description: "Appended automatically: when the domain went live and which origin was added.",
      },
    },
  ],
};
