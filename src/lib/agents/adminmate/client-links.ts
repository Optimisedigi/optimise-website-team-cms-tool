import type { CanonicalTool } from '../_shared/tool'
import { MAX_CONTRACTS, resolveClient, type ClientDetailsReader } from './client-details'
import {
  clientHubHref,
  MAX_CLIENT_LINKS,
  toSafeClientLink,
  type ClientLink,
} from './client-link-href'
import {
  CLIENT_LINK_SOURCE_KINDS,
  type ClientLinkSourceKind,
  type ClientLinkSourcesReader,
} from './client-link-sources'
import type { AdminMateClient } from './tools'

/**
 * Clickable CMS links for one client, built server-side from record ids so the
 * model never types (or invents) a URL. The chat shows them as buttons only
 * when the agent calls `get_client_links`, i.e. when the admin asks for a link.
 * Hrefs are allow-listed CMS paths (or https links an admin saved on the
 * client's hub links); the pages behind them keep their own auth.
 */

export const CLIENT_LINK_KINDS = [
  'client_record',
  'client_hub',
  'contracts',
  ...CLIENT_LINK_SOURCE_KINDS,
] as const
export type ClientLinkKind = (typeof CLIENT_LINK_KINDS)[number]

export type { ClientLink }

interface ClientLinksArgs {
  client: string
  kinds: ClientLinkKind[]
}

const KIND_SET = new Set<string>(CLIENT_LINK_KINDS)
const SOURCE_KIND_SET = new Set<string>(CLIENT_LINK_SOURCE_KINDS)

const SOURCE_KIND_NAMES: Record<ClientLinkSourceKind, string> = {
  proposals: 'proposals',
  discovery_briefings: 'discovery briefings',
  audits: 'audits',
  decks: 'decks or presentations',
  portal_links: 'client hub links',
}

const CONTRACT_STATUS: Record<string, string> = {
  draft: 'draft',
  sent: 'sent',
  completed: 'signed',
}

function validateClientLinksArgs(raw: unknown): ClientLinksArgs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('input must be an object')
  const input = raw as Record<string, unknown>
  const client =
    typeof input.client === 'string'
      ? input.client.trim()
      : typeof input.client === 'number'
        ? String(input.client)
        : ''
  if (!client || client.length > 200)
    throw new Error('client must be a client id, slug or name (1-200 characters)')
  if (!Array.isArray(input.kinds) || input.kinds.length === 0)
    throw new Error('kinds must list at least one link kind')
  for (const kind of input.kinds) {
    if (typeof kind !== 'string' || !KIND_SET.has(kind))
      throw new Error('kinds contains an unknown link kind')
  }
  const kinds = CLIENT_LINK_KINDS.filter((kind) => (input.kinds as string[]).includes(kind))
  return { client, kinds }
}

export function createClientLinksTool(
  existing: AdminMateClient[],
  reader: Pick<ClientDetailsReader, 'getContracts'>,
  sources?: ClientLinkSourcesReader,
): CanonicalTool<unknown> {
  const tool: CanonicalTool<ClientLinksArgs> = {
    name: 'get_client_links',
    description:
      'Get clickable CMS links for one existing client. The chat shows them to the admin as buttons, so call this whenever the admin asks for a link or wants to open something. Kinds: ' +
      "'client_record' = the client's record in the CMS admin; " +
      "'client_hub' = the client-facing hub page (PIN-gated); " +
      "'contracts' = each of the client's contracts in the CMS admin plus its PDF (the signed PDF once fully signed, otherwise a preview); " +
      "'proposals' = the client's proposals (the proposal page once its audit is complete, plus the CMS record); " +
      "'discovery_briefings' = the client's discovery briefing forms (including ones started on their proposal) plus the CMS records; " +
      "'audits' = the client's SEO audits and SEO audit proposals (report pages), Google Ads audits (negative keyword build page), CRO audits, competitor analyses, site health reports, tag setup audits, GSC indexing audits and SEO migration checks (CMS records), and the SEO & CRO report page; " +
      "'decks' = the client's slide decks and presentations, including generated Google Ads audit decks; " +
      "'portal_links' = the links saved on the client's hub (documents, dashboards and other resources). " +
      "For 'audit links' request both 'audits' and 'decks'. Never write or guess URLs yourself; refer the admin to the buttons.",
    inputSchema: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description:
            "Client id from find_clients, or the client's slug, name, trading name or website.",
        },
        kinds: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: [...CLIENT_LINK_KINDS] },
          description: 'Only the link kinds the admin asked for.',
        },
      },
      required: ['client', 'kinds'],
      additionalProperties: false,
    },
    validate: validateClientLinksArgs,
    execute: async (args, ctx) => {
      const resolution = resolveClient(args.client, existing)
      if (resolution.kind === 'none') {
        return {
          ok: false,
          error: `No client matched "${args.client}". Call find_clients to search, then retry with the client id.`,
        }
      }
      if (resolution.kind === 'ambiguous') {
        return {
          ok: true,
          data: {
            needsClientChoice: true,
            candidates: resolution.candidates.map(({ id, name, slug, isActive }) => ({
              id,
              name,
              slug,
              isActive,
            })),
            instruction:
              'Several clients match. Ask the admin which one, or retry with the exact client id.',
          },
        }
      }
      const client = resolution.client
      const links: ClientLink[] = []
      let contractsNote: string | undefined

      if (args.kinds.includes('client_record')) {
        links.push({
          label: `${client.name} — client record`,
          href: `/admin/collections/clients/${client.id}`,
        })
      }
      if (args.kinds.includes('client_hub') && client.slug) {
        links.push({ label: `${client.name} — client hub`, href: clientHubHref(client.slug) })
      }
      if (args.kinds.includes('contracts')) {
        const started = Date.now()
        const names = [client.name, client.tradingName ?? ''].filter(Boolean)
        const contracts = await reader.getContracts(client.id, names)
        ctx.log('adminmate get_client_links contracts', {
          clientId: client.id,
          contracts: contracts?.length ?? null,
          elapsedMs: Date.now() - started,
        })
        if (contracts === null) contractsNote = 'Contracts could not be loaded.'
        else if (contracts.length === 0)
          contractsNote = 'No contracts are recorded in the CMS for this client.'
        else {
          if (contracts.length >= MAX_CONTRACTS) {
            contractsNote = `Showing the ${MAX_CONTRACTS} most recent contracts; older ones are in the CMS Contracts list.`
          }
          for (const contract of contracts) {
            const status = contract.status
              ? (CONTRACT_STATUS[contract.status] ?? contract.status)
              : null
            const name = `${contract.title}${status ? ` (${status})` : ''}`
            links.push({ label: name, href: `/admin/collections/contracts/${contract.id}` })
            links.push(
              contract.hasSignedPdf
                ? {
                    label: `${contract.title} — signed PDF`,
                    href: `/api/contracts/${contract.id}/download-pdf`,
                  }
                : {
                    label: `${contract.title} — PDF preview`,
                    href: `/api/contracts/${contract.id}/preview-pdf`,
                  },
            )
          }
        }
      }

      const notes: string[] = contractsNote ? [contractsNote] : []
      const sourceKinds = args.kinds.filter((kind): kind is ClientLinkSourceKind =>
        SOURCE_KIND_SET.has(kind),
      )
      if (sourceKinds.length > 0) {
        if (!sources) {
          notes.push(
            `Links for ${sourceKinds.map((kind) => SOURCE_KIND_NAMES[kind]).join(', ')} are not available right now.`,
          )
        } else {
          const started = Date.now()
          const found = await sources.getLinks(
            { id: client.id, name: client.name, slug: client.slug },
            sourceKinds,
          )
          ctx.log('adminmate get_client_links sources', {
            clientId: client.id,
            kinds: sourceKinds,
            counts: Object.fromEntries(
              sourceKinds.map((kind) => [kind, found[kind]?.length ?? null]),
            ),
            elapsedMs: Date.now() - started,
          })
          for (const kind of sourceKinds) {
            const kindLinks = found[kind]
            if (kindLinks == null)
              notes.push(`Links for ${SOURCE_KIND_NAMES[kind]} could not be loaded.`)
            else if (kindLinks.length === 0)
              notes.push(`No ${SOURCE_KIND_NAMES[kind]} are recorded in the CMS for this client.`)
            else links.push(...kindLinks)
          }
        }
      }

      const allowed = links.flatMap((link) => {
        const clean = toSafeClientLink(link)
        return clean ? [clean] : []
      })
      const safe = allowed.slice(0, MAX_CLIENT_LINKS)
      if (allowed.length > safe.length) {
        notes.push(
          `Showing ${safe.length} of ${allowed.length} links; ask for one kind at a time to see the rest.`,
        )
      }
      return {
        ok: true,
        data: {
          client: { id: client.id, name: client.name },
          links: safe,
          ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
          instruction:
            safe.length > 0
              ? 'These links are shown to the admin as buttons under your reply. Mention what each is for; do not paste the URLs.'
              : 'No links are available for what was asked; say so plainly.',
        },
      }
    },
  }
  return tool as CanonicalTool<unknown>
}
