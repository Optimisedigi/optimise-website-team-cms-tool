/**
 * One-off script: Import a ClientProcess into a ProcessTemplate.
 * 
 * Usage: npx tsx scripts/import-process-to-template.ts
 * 
 * Lists all client processes, then imports the first Google Ads one as a template.
 */

import { getPayload } from 'payload'
import config from '../src/payload.config'

async function main() {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Find all client processes
  const results = await payload.find({
    collection: 'client-processes' as any,
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  console.log(`\nFound ${results.docs.length} client processes:\n`)
  for (const doc of results.docs) {
    const d = doc as any
    const phaseCount = d.phases?.length || 0
    const stepCount = (d.phases || []).reduce((n: number, p: any) => n + (p.steps?.length || 0), 0)
    console.log(`  ID: ${d.id} | ${d.processTitle} | ${d.retainerType || '?'} | ${phaseCount} phases, ${stepCount} steps`)
  }

  // Find the Google Ads client process (look for google_ads retainer or title containing Google Ads)
  const googleAdsProcess = results.docs.find((d: any) => 
    d.retainerType === 'google_ads_only' || 
    (d.processTitle || '').toLowerCase().includes('google ads')
  ) as any

  if (!googleAdsProcess) {
    console.log('\nNo Google Ads client process found. Exiting.')
    process.exit(0)
  }

  console.log(`\nImporting: "${googleAdsProcess.processTitle}" (ID: ${googleAdsProcess.id})`)

  // Map phases/steps into template format
  const phases = (googleAdsProcess.phases || []).map((phase: any, pi: number) => ({
    phaseName: phase.phaseName,
    phaseOrder: phase.phaseOrder ?? pi + 1,
    phaseDescription: phase.phaseDescription || undefined,
    weekRange: phase.weekRange || undefined,
    steps: (phase.steps || []).map((step: any, si: number) => ({
      stepName: step.stepName,
      stepOrder: step.stepOrder ?? si + 1,
      stepDescription: step.stepDescription || undefined,
      stepType: step.stepType || undefined,
      defaultAssignee: step.defaultAssignee || undefined,
      estimatedDuration: step.estimatedDuration || undefined,
      isAutomatable: step.isAutomatable || false,
      automationNotes: step.automationNotes || undefined,
      emailTemplateSubject: step.emailTemplateSubject || undefined,
      emailTemplateBody: step.emailTemplateBody || undefined,
      reminderDays: step.reminderDays ?? undefined,
      requiredBeforeNext: step.requiredBeforeNext || false,
      clientVisible: step.clientVisible || false,
      clientLabel: step.clientLabel || undefined,
      requiresApproval: step.requiresApproval || false,
    })),
  }))

  const templateName = 'Google Ads Onboarding & Management'

  const template = await payload.create({
    collection: 'process-templates' as any,
    data: {
      name: templateName,
      retainerType: 'google_ads_only',
      description: `Imported from client process: ${googleAdsProcess.processTitle}. Full Google Ads onboarding workflow from quick wins through to ongoing management.`,
      isActive: true,
      isDefault: false,
      phases,
    },
    overrideAccess: true,
  })

  const totalSteps = phases.reduce((n: number, p: any) => n + (p.steps?.length || 0), 0)

  console.log(`\n✅ Created template "${templateName}"`)
  console.log(`   ID: ${(template as any).id}`)
  console.log(`   ${phases.length} phases, ${totalSteps} steps`)
  console.log(`\nYou can now find it in Process Templates in the CMS admin.`)

  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
