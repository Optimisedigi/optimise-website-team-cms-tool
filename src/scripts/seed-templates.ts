import { getPayload } from 'payload'
import config from '../payload.config'
import { seedAllProcessTemplates } from '../lib/seed-process-templates'

async function main() {
  const payload = await getPayload({ config })
  await seedAllProcessTemplates(payload)
  process.exit(0)
}
main().catch(console.error)
