import type { CanonicalTool } from '../_shared/tool'
import { boundedText, emailPattern, normaliseWebsiteUrl, slugPattern, toClientSlug } from './tools'

/**
 * Business categories the Client Proposals collection accepts. Drives SEO/CRO
 * audit scoring weights and carries over to the Client record on conversion.
 */
export const PROPOSAL_BUSINESS_TYPE_OPTIONS = [
  { label: 'Trades & Home Services', value: 'trades' },
  { label: 'Professional Services', value: 'services' },
  { label: 'E-commerce / Retail', value: 'ecommerce' },
  { label: 'Healthcare', value: 'healthcare' },
  { label: 'Hospitality & Food', value: 'hospitality' },
  { label: 'Real Estate', value: 'realestate' },
  { label: 'Education & Training', value: 'education' },
  { label: 'SaaS / Technology', value: 'saas' },
  { label: 'Other', value: 'other' },
] as const
export type ProposalBusinessType = (typeof PROPOSAL_BUSINESS_TYPE_OPTIONS)[number]['value']

/** Conversion goals the Client Proposals collection accepts. */
export const PROPOSAL_CONVERSION_GOAL_OPTIONS = [
  { label: 'Lead Generation', value: 'lead generation' },
  { label: 'Phone Calls', value: 'phone calls' },
  { label: 'Form Submissions', value: 'form submissions' },
  { label: 'E-commerce Sales', value: 'e-commerce' },
  { label: 'Bookings / Appointments', value: 'bookings' },
  { label: 'Quote Requests', value: 'quote requests' },
  { label: 'Email Sign-ups', value: 'email sign-ups' },
  { label: 'Free Trial Sign-ups', value: 'free trial' },
  { label: 'Content Downloads', value: 'content downloads' },
  { label: 'Brand Awareness', value: 'brand awareness' },
] as const
export type ProposalConversionGoal = (typeof PROPOSAL_CONVERSION_GOAL_OPTIONS)[number]['value']

/**
 * The only `client-proposals` fields AdminMate may set. Audit, keyword,
 * mockup, presentation and tracking fields stay admin-only.
 */
export interface StagedProposal {
  businessName: string
  slug: string
  websiteUrl: string
  contactName?: string
  contactEmail?: string
  businessType?: ProposalBusinessType
  conversionGoal?: ProposalConversionGoal
  businessGoals?: string
  notes?: string
}

const businessTypes = new Set<string>(PROPOSAL_BUSINESS_TYPE_OPTIONS.map(({ value }) => value))
const conversionGoals = new Set<string>(PROPOSAL_CONVERSION_GOAL_OPTIONS.map(({ value }) => value))

/**
 * Re-validates a staged proposal. Runs inside the model loop and again in the
 * create route, so an edited browser payload gets the same field allowlist and
 * enum checks as the model's own output.
 */
export function validateStagedProposal(raw: unknown): StagedProposal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('input must be an object')
  const input = raw as Record<string, unknown>

  const businessName = boundedText(input.businessName, 'businessName', 200) ?? ''
  const slug = boundedText(input.slug, 'slug', 100, false) ?? toClientSlug(businessName)
  if (!slugPattern.test(slug))
    throw new Error('slug must be lowercase letters, numbers and hyphens')

  const websiteUrl = normaliseWebsiteUrl(boundedText(input.websiteUrl, 'websiteUrl', 300) ?? '')
  const contactEmail = boundedText(input.contactEmail, 'contactEmail', 200, false)
  if (contactEmail && !emailPattern.test(contactEmail))
    throw new Error('contactEmail must be a valid email address')

  const businessType = boundedText(input.businessType, 'businessType', 30, false)
  if (businessType && !businessTypes.has(businessType)) throw new Error('businessType is invalid')
  const conversionGoal = boundedText(input.conversionGoal, 'conversionGoal', 40, false)
  if (conversionGoal && !conversionGoals.has(conversionGoal))
    throw new Error('conversionGoal is invalid')

  return {
    businessName,
    slug,
    websiteUrl,
    contactName: boundedText(input.contactName, 'contactName', 200, false),
    contactEmail,
    businessType: businessType as ProposalBusinessType | undefined,
    conversionGoal: conversionGoal as ProposalConversionGoal | undefined,
    businessGoals: boundedText(input.businessGoals, 'businessGoals', 4000, false),
    notes: boundedText(input.notes, 'notes', 4000, false),
  }
}

export function createAdminMateProposalTool(): CanonicalTool<StagedProposal> {
  return {
    name: 'stage_client_proposal',
    description:
      'Stage a new client proposal (a Client Proposals record for a prospect) for human review. No CMS write happens here — the admin edits and confirms the staged card, and a separate confirmed action creates the proposal. businessName and websiteUrl are required; ask the admin for the website if it is missing.',
    inputSchema: {
      type: 'object',
      properties: {
        businessName: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: "Prospect business name, e.g. 'Acme Corp'.",
        },
        slug: {
          type: 'string',
          maxLength: 100,
          description: 'URL-friendly identifier. Omit to derive it from the business name.',
        },
        websiteUrl: {
          type: 'string',
          minLength: 1,
          maxLength: 300,
          description:
            "Prospect website, e.g. 'https://acmecorp.com'. Used by the SEO, CRO and content audits.",
        },
        contactName: { type: 'string', maxLength: 200 },
        contactEmail: { type: 'string', maxLength: 200 },
        businessType: {
          type: 'string',
          enum: [...PROPOSAL_BUSINESS_TYPE_OPTIONS.map(({ value }) => value)],
          description: 'Business category; drives audit scoring weights.',
        },
        conversionGoal: {
          type: 'string',
          enum: [...PROPOSAL_CONVERSION_GOAL_OPTIONS.map(({ value }) => value)],
          description: 'What the prospect wants visitors to do.',
        },
        businessGoals: {
          type: 'string',
          maxLength: 4000,
          description: 'What the prospect wants to achieve.',
        },
        notes: { type: 'string', maxLength: 4000, description: 'Internal team notes.' },
      },
      required: ['businessName', 'websiteUrl'],
      additionalProperties: false,
    },
    validate: (raw) => validateStagedProposal(raw),
    execute: async (staged) => ({ ok: true, data: { staged } }),
  }
}
