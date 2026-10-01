import type { Payload, Where } from 'payload'
import { padBriefingId } from '../../discovery-briefing/route-utils'
import { toSafeClientLink, type ClientLink } from './client-link-href'

/**
 * Loads the records behind a client's links (proposals, discovery briefings,
 * audits, decks, hub portal links) and turns them into CMS links. Every URL
 * is built here from stored ids/slugs using the same paths the CMS admin's
 * own "View" buttons use; the model never supplies one.
 */

export const CLIENT_LINK_SOURCE_KINDS = [
  'proposals',
  'discovery_briefings',
  'audits',
  'decks',
  'portal_links',
] as const
export type ClientLinkSourceKind = (typeof CLIENT_LINK_SOURCE_KINDS)[number]

/** Links per kind; null when that kind could not be loaded. */
export type ClientLinkSourceResult = Partial<Record<ClientLinkSourceKind, ClientLink[] | null>>

export interface ClientLinkSourcesReader {
  getLinks(
    client: { id: string; name: string; slug: string },
    kinds: ClientLinkSourceKind[],
  ): Promise<ClientLinkSourceResult>
}

type Doc = Record<string, unknown> & { id: number | string }
type FindDocs = (args: {
  collection: string
  where: Where
  sort: string
  limit: number
  depth: 0
  overrideAccess: true
  select: Record<string, true>
}) => Promise<{ docs: Doc[] }>

const PROPOSAL_LIMIT = 5
const BRIEFING_LIMIT = 5
const PER_AUDIT_TYPE_LIMIT = 3

interface AuditSource {
  collection: string
  name: string
  titleField: string
  extraFields?: string[]
  /** Public/report page for one record, when the CMS has one. */
  publicLink?: (doc: Doc, name: string) => ClientLink | null
}

const segment = (value: unknown): string => encodeURIComponent(String(value))
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const day = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null

const AUDIT_SOURCES: readonly AuditSource[] = [
  {
    collection: 'seo-audits',
    name: 'SEO audit',
    titleField: 'websiteUrl',
    extraFields: ['reportSlug'],
    publicLink: (doc, name) => ({
      label: `${name} — report`,
      href: `/audits/${segment(text(doc.reportSlug) ?? doc.id)}`,
    }),
  },
  {
    collection: 'seo-audit-proposals',
    name: 'SEO audit proposal',
    titleField: 'websiteUrl',
    extraFields: ['reportSlug'],
    publicLink: (doc, name) => ({
      label: `${name} — report`,
      href: `/seo-audit-proposals/${segment(text(doc.reportSlug) ?? doc.id)}/v2`,
    }),
  },
  { collection: 'cro-audits', name: 'CRO audit', titleField: 'websiteUrl' },
  {
    collection: 'google-ads-audits',
    name: 'Google Ads audit',
    titleField: 'businessName',
    extraFields: ['slug'],
    publicLink: (doc, name) => {
      const slug = text(doc.slug)
      return slug
        ? {
            label: `${name} — negative keyword build`,
            href: `/negative-keyword-build/${segment(slug)}`,
          }
        : null
    },
  },
  { collection: 'competitor-analyses', name: 'Competitor analysis', titleField: 'websiteUrl' },
  { collection: 'site-health-reports', name: 'Site health report', titleField: 'siteUrl' },
  { collection: 'tag-setup-audits', name: 'Tag setup audit', titleField: 'url' },
  { collection: 'gsc-indexing-audits', name: 'GSC indexing audit', titleField: 'siteUrl' },
  { collection: 'seo-migration-checks', name: 'SEO migration check', titleField: 'title' },
]

function adminLink(collection: string, id: Doc['id'], label: string): ClientLink {
  return { label, href: `/admin/collections/${collection}/${segment(id)}` }
}

function safe(links: ClientLink[]): ClientLink[] {
  return links.flatMap((link) => {
    const clean = toSafeClientLink(link)
    return clean ? [clean] : []
  })
}

export function createPayloadClientLinkSourcesReader(payload: Payload): ClientLinkSourcesReader {
  // Collections are chosen at runtime, so call find through a loose signature (keeping `this`).
  const find: FindDocs = (args) => (payload as unknown as { find: FindDocs }).find(args)

  const byClient = (collection: string, clientId: number, select: string[], limit: number) =>
    find({
      collection,
      where: { client: { equals: clientId } },
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: true,
      select: Object.fromEntries([...select, 'createdAt'].map((field) => [field, true])),
    })

  const loadProposals = async (clientId: number) =>
    (
      await byClient(
        'client-proposals',
        clientId,
        ['businessName', 'slug', 'auditStatus'],
        PROPOSAL_LIMIT,
      )
    ).docs

  const proposals = async (clientId: number): Promise<ClientLink[]> => {
    const links: ClientLink[] = []
    for (const doc of await loadProposals(clientId)) {
      const name = `${text(doc.businessName) ?? 'Proposal'} proposal${day(doc.createdAt) ? ` (${day(doc.createdAt)})` : ''}`
      if (doc.auditStatus === 'completed') {
        links.push({ label: name, href: `/proposals/${segment(text(doc.slug) ?? doc.id)}` })
      }
      links.push(adminLink('client-proposals', doc.id, `${name} — CMS record`))
    }
    return links
  }

  const briefings = async (client: { slug: string }, clientId: number): Promise<ClientLink[]> => {
    const proposalDocs = await loadProposals(clientId)
    const proposalSlugs = new Map(proposalDocs.map((doc) => [Number(doc.id), text(doc.slug)]))
    const where: Where =
      proposalSlugs.size > 0
        ? {
            or: [
              { client: { equals: clientId } },
              { clientProposal: { in: [...proposalSlugs.keys()] } },
            ],
          }
        : { client: { equals: clientId } }
    const { docs } = await find({
      collection: 'client-discovery-briefings',
      where,
      sort: '-updatedAt',
      limit: BRIEFING_LIMIT,
      depth: 0,
      overrideAccess: true,
      select: { title: true, client: true, clientProposal: true, updatedAt: true },
    })
    const links: ClientLink[] = []
    for (const doc of docs) {
      const name = text(doc.title) ?? 'Discovery briefing'
      const padded = padBriefingId(Number(doc.id))
      const proposalSlug = proposalSlugs.get(Number(doc.clientProposal))
      if (Number(doc.client) === clientId) {
        links.push({ label: name, href: `/client/${segment(client.slug)}/discovery/${padded}` })
      } else if (proposalSlug) {
        links.push({
          label: name,
          href: `/client-proposal/${segment(proposalSlug)}/discovery/${padded}`,
        })
      }
      links.push(adminLink('client-discovery-briefings', doc.id, `${name} — CMS record`))
    }
    return links
  }

  const audits = async (client: { slug: string }, clientId: number): Promise<ClientLink[]> => {
    const settled = await Promise.allSettled(
      AUDIT_SOURCES.map(async (source) => ({
        source,
        docs: (
          await byClient(
            source.collection,
            clientId,
            [source.titleField, ...(source.extraFields ?? [])],
            PER_AUDIT_TYPE_LIMIT,
          )
        ).docs,
      })),
    )
    // One audit type failing should not hide the others; fail only if all do.
    const results = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    if (results.length === 0) throw new Error('No audit records could be loaded')
    const links: ClientLink[] = []
    let hasSeoOrCro = false
    for (const { source, docs } of results) {
      if (
        docs.length > 0 &&
        (source.collection === 'seo-audits' || source.collection === 'cro-audits')
      )
        hasSeoOrCro = true
      for (const doc of docs) {
        const title = text(doc[source.titleField])
        const name = `${source.name}${title ? ` — ${title}` : ''}${day(doc.createdAt) ? ` (${day(doc.createdAt)})` : ''}`
        const publicLink = source.publicLink?.(doc, name)
        if (publicLink) links.push(publicLink)
        links.push(adminLink(source.collection, doc.id, `${name} — CMS record`))
      }
    }
    if (hasSeoOrCro)
      links.unshift({ label: 'SEO & CRO report page', href: `/reports/${segment(client.slug)}` })
    return links
  }

  const clientDoc = async (clientId: number, field: 'presentations' | 'clientPortalLinks') =>
    (
      await find({
        collection: 'clients',
        where: { id: { equals: clientId } },
        sort: 'id',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { [field]: true },
      })
    ).docs[0]

  const decks = async (client: { slug: string }, clientId: number): Promise<ClientLink[]> => {
    const doc = await clientDoc(clientId, 'presentations')
    const rows = Array.isArray(doc?.presentations)
      ? (doc.presentations as Array<Record<string, unknown>>)
      : []
    return rows.flatMap((row) => {
      const deckSlug = text(row.deckSlug)
      const title = text(row.title) ?? 'Deck'
      const label = `${title}${row.isPublic === false ? ' (not public)' : ''}`
      if (deckSlug)
        return [{ label, href: `/partners/${segment(client.slug)}/${segment(deckSlug)}/` }]
      const url = text(row.deckUrl)
      return url ? [{ label, href: url, external: true as const }] : []
    })
  }

  const portalLinks = async (clientId: number): Promise<ClientLink[]> => {
    const doc = await clientDoc(clientId, 'clientPortalLinks')
    const rows = Array.isArray(doc?.clientPortalLinks)
      ? (doc.clientPortalLinks as Array<Record<string, unknown>>)
      : []
    return [...rows]
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      .flatMap((row) => {
        const label = text(row.label)
        const url = text(row.url)
        if (!label || !url) return []
        const tagged = `${label}${row.visibility === 'internal' ? ' (internal)' : ''}`
        // Hub links may be CMS pages or outside tools (dashboards, documents).
        return [
          url.startsWith('/')
            ? { label: tagged, href: url }
            : { label: tagged, href: url, external: true as const },
        ]
      })
  }

  return {
    async getLinks(client, kinds) {
      const clientId = Number(client.id)
      if (!Number.isSafeInteger(clientId)) {
        return Object.fromEntries(kinds.map((kind) => [kind, null]))
      }
      const loaders: Record<ClientLinkSourceKind, () => Promise<ClientLink[]>> = {
        proposals: () => proposals(clientId),
        discovery_briefings: () => briefings(client, clientId),
        audits: () => audits(client, clientId),
        decks: () => decks(client, clientId),
        portal_links: () => portalLinks(clientId),
      }
      const entries = await Promise.all(
        kinds.map(async (kind) => {
          try {
            return [kind, safe(await loaders[kind]())] as const
          } catch {
            return [kind, null] as const
          }
        }),
      )
      return Object.fromEntries(entries)
    },
  }
}
