import { describe, expect, it } from 'vitest'
import {
  createAdminMateProposalTool,
  validateStagedProposal,
} from '@/lib/agents/adminmate/proposal-tools'

describe('validateStagedProposal', () => {
  it('normalises a full staged proposal', () => {
    expect(
      validateStagedProposal({
        businessName: '  Aussie Fluid Power  ',
        websiteUrl: 'aussiefluidpower.com.au',
        contactName: 'Priya',
        contactEmail: 'priya@aussiefluidpower.com.au',
        businessType: 'trades',
        conversionGoal: 'quote requests',
        businessGoals: '  More hydraulic service work  ',
        notes: '  Referred by AMP  ',
      }),
    ).toEqual({
      businessName: 'Aussie Fluid Power',
      slug: 'aussie-fluid-power',
      websiteUrl: 'https://aussiefluidpower.com.au',
      contactName: 'Priya',
      contactEmail: 'priya@aussiefluidpower.com.au',
      businessType: 'trades',
      conversionGoal: 'quote requests',
      businessGoals: 'More hydraulic service work',
      notes: 'Referred by AMP',
    })
  })

  it('derives the slug from the business name unless one is given', () => {
    expect(
      validateStagedProposal({ businessName: 'Smith & Sons', websiteUrl: 'smith.com.au' }).slug,
    ).toBe('smith-sons')
    expect(
      validateStagedProposal({
        businessName: 'Smith & Sons',
        websiteUrl: 'smith.com.au',
        slug: 'smith-sons-pty',
      }).slug,
    ).toBe('smith-sons-pty')
  })

  it('rejects invalid values before anything is written', () => {
    expect(() => validateStagedProposal({ websiteUrl: 'acme.com' })).toThrow(
      /businessName is required/,
    )
    expect(() => validateStagedProposal({ businessName: 'Acme' })).toThrow(/websiteUrl is required/)
    expect(() =>
      validateStagedProposal({ businessName: 'Acme', websiteUrl: 'acme.com', slug: 'Not A Slug' }),
    ).toThrow(/slug/)
    expect(() =>
      validateStagedProposal({
        businessName: 'Acme',
        websiteUrl: 'acme.com',
        contactEmail: 'nope',
      }),
    ).toThrow(/contactEmail/)
    expect(() =>
      validateStagedProposal({
        businessName: 'Acme',
        websiteUrl: 'acme.com',
        businessType: 'hacking',
      }),
    ).toThrow(/businessType/)
    expect(() =>
      validateStagedProposal({
        businessName: 'Acme',
        websiteUrl: 'acme.com',
        conversionGoal: 'world peace',
      }),
    ).toThrow(/conversionGoal/)
    expect(() =>
      validateStagedProposal({ businessName: 'Acme', websiteUrl: 'ftp://acme.com' }),
    ).toThrow(/http/)
  })

  it('drops fields outside the allowlist', () => {
    const staged = validateStagedProposal({
      businessName: 'Acme',
      websiteUrl: 'acme.com',
      proposalPin: '1234',
      googleAdsCustomerId: '123-456-7890',
      auditStatus: 'running',
    }) as Record<string, unknown>
    expect(Object.keys(staged)).not.toContain('proposalPin')
    expect(Object.keys(staged)).not.toContain('googleAdsCustomerId')
    expect(Object.keys(staged)).not.toContain('auditStatus')
  })
})

describe('stage_client_proposal tool', () => {
  it('requires the business name and website and stages without side effects', async () => {
    const tool = createAdminMateProposalTool()
    expect(tool.name).toBe('stage_client_proposal')
    expect(tool.inputSchema.required).toEqual(['businessName', 'websiteUrl'])
    expect(tool.sideEffect).toBeUndefined()
    expect(tool.validate?.({ businessName: 'Acme', websiteUrl: 'acme.com' })).toMatchObject({
      businessName: 'Acme',
      slug: 'acme',
      websiteUrl: 'https://acme.com',
    })
  })
})
