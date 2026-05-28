import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const cmsApiRoot = 'src/app/(frontend)/api'
const growthToolsRoot = process.env.GROWTH_TOOLS_REPO || '/Users/Pe/my-projects/client/website-optimise-digital/website-growth-tools'

function listFiles(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function routePathFromFile(file) {
  const rel = relative(cmsApiRoot, file).replace(/\\/g, '/')
  return `/api/${rel.replace(/\/route\.ts$/, '').replace(/\/index$/, '')}`
}

function exportedMethods(source) {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  return methods.filter((method) => new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source))
}

function classifyAuth(source) {
  if (/payload\.auth\s*\(/.test(source)) return 'payload-session'
  if (/CRON_SECRET|cronSecret|x-cron|Authorization.*Bearer/.test(source)) return 'cron-or-bearer-secret'
  if (/AUDIT_API_KEY|INTERNAL_API_KEY|x-api-key|x-internal-key/.test(source)) return 'api-key/internal-key'
  if (/checkPinWithLockout|clientPin|proposalPin|reportPassword|PIN/.test(source)) return 'pin-gated'
  if (/token\]|\[token\]|params.*token/.test(source)) return 'token-param'
  return 'none-detected'
}

function classifyValidation(source) {
  const markers = []
  if (/\.json\s*\(/.test(source)) markers.push('json-body')
  if (/searchParams/.test(source)) markers.push('query-params')
  if (/z\.|safeParse|parse\(/.test(source)) markers.push('schema-or-parse')
  if (/return\s+NextResponse\.json\([^)]*status:\s*400/s.test(source) || /status:\s*400/.test(source)) markers.push('400-validation')
  return markers.length ? markers.join(', ') : 'none-detected'
}

function classifyExternal(source) {
  const external = []
  if (/GROWTH_TOOLS_URL/.test(source)) external.push('growth-tools')
  if (/fetch\s*\(/.test(source)) external.push('fetch')
  if (/googleapis|gmail|Gmail|GSC|Search Console/.test(source)) external.push('google')
  if (/xero|Xero/.test(source)) external.push('xero')
  if (/postmark|brevo|sendgrid|email/i.test(source)) external.push('email')
  if (/blob|put\(/i.test(source)) external.push('blob')
  return external.join(', ')
}

function normalizeGrowthToolsPath(raw) {
  if (!raw) return null
  let path = raw.trim()
  path = path.replace(/^\$\{GROWTH_TOOLS_URL\}/, '')
  path = path.replace(/^\$\{growthToolsUrl\}/, '')
  path = path.replace(/^\$\{baseUrl\}/, '')
  path = path.replace(/^https?:\/\/[^/]+/, '')
  path = path.replace(/\?.*$/, '')
  path = path.replace(/\$\{[^}]+\}/g, ':param')
  path = path.replace(/\+\s*encodeURIComponent\([^)]*\)/g, ':param')
  path = path.replace(/\+\s*[^`'"\s]+/g, ':param')
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

function extractGrowthToolsCalls(source) {
  const calls = []
  const patterns = [
    /fetch\(\s*`\$\{GROWTH_TOOLS_URL\}([^`]+)`\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    /fetch\(\s*`\$\{growthToolsUrl\}([^`]+)`\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    /fetch\(\s*`\$\{baseUrl\}([^`]+)`\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    /fetch\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{([\s\S]*?)\}\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const rawPath = match[1]
      const options = match[2] ?? ''
      const mentionsGrowthTools = match[0].includes('GROWTH_TOOLS_URL') || match[0].includes('growthToolsUrl') || match[0].includes('baseUrl') || /x-internal-key/.test(options)
      if (!mentionsGrowthTools) continue
      const path = normalizeGrowthToolsPath(rawPath)
      if (!path || !path.startsWith('/api/')) continue
      const method = options.match(/method:\s*[`'"]([A-Z]+)[`'"]/)?.[1] ?? 'GET'
      calls.push({ method, path })
    }
  }
  return Array.from(new Map(calls.map((call) => [`${call.method} ${call.path}`, call])).values())
}

function growthRouteToRegex(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/:([A-Za-z0-9_]+)/g, '[^/]+')}$`)
}

let growthToolRoutes = []
const growthRoutesFile = `${growthToolsRoot}/server/routes.ts`
try {
  const source = readFileSync(growthRoutesFile, 'utf8')
  growthToolRoutes = [...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)/g)]
    .map((m) => ({ method: m[1].toUpperCase(), path: m[2], file: growthRoutesFile }))
    .sort((a, b) => `${a.path}${a.method}`.localeCompare(`${b.path}${b.method}`))
} catch {}

function findGrowthToolsMatch(call) {
  return growthToolRoutes.find((route) => route.method === call.method && growthRouteToRegex(route.path).test(call.path)) ?? null
}

const cmsFiles = listFiles('find', [cmsApiRoot, '-path', '*/route.ts', '-type', 'f']).sort()
const cmsRows = cmsFiles.map((file) => {
  const source = readFileSync(file, 'utf8')
  const growthToolsCalls = extractGrowthToolsCalls(source).map((call) => ({
    ...call,
    matchedGrowthToolsRoute: findGrowthToolsMatch(call)?.path ?? null,
  }))
  return {
    route: routePathFromFile(file),
    file,
    methods: exportedMethods(source),
    auth: classifyAuth(source),
    validation: classifyValidation(source),
    external: classifyExternal(source),
    hasTryCatch: /try\s*{/.test(source),
    growthToolsCalls,
    unmatchedGrowthToolsCalls: growthToolsCalls.filter((call) => !call.matchedGrowthToolsRoute),
  }
})

const growthToolsCallRows = cmsRows.flatMap((row) =>
  row.growthToolsCalls.map((call) => ({ cmsRoute: row.route, cmsFile: row.file, ...call })),
)
const unmatchedGrowthToolsCalls = growthToolsCallRows.filter((call) => !call.matchedGrowthToolsRoute)

const lines = []
lines.push('# API Endpoint Inventory')
lines.push('')
lines.push('Generated by `node scripts/inventory-api-endpoints.mjs`.')
lines.push('')
lines.push(`CMS route files inventoried: ${cmsRows.length}`)
lines.push(`Growth Tools route registrations inventoried: ${growthToolRoutes.length}`)
lines.push(`CMS → Growth Tools calls detected: ${growthToolsCallRows.length}`)
lines.push(`CMS → Growth Tools unmatched calls: ${unmatchedGrowthToolsCalls.length}`)
lines.push('')
lines.push('## Integration test strategy')
lines.push('')
lines.push('- Unit-style route integration tests should import `GET`/`POST`/etc directly and call them with `NextRequest`.')
lines.push('- Mock `payload.getPayload`, `@/payload.config`, external `fetch`, OAuth clients, email, and blob services at module boundaries.')
lines.push('- For every endpoint, cover the supported happy path, auth failure if auth is required, validation/body/query failure when inputs are required, and downstream error mapping.')
lines.push('- Growth Tools-backed CMS endpoints should assert the outbound URL, method, auth header, request body, and mapped non-2xx response.')
lines.push('')
lines.push('## CMS endpoints')
lines.push('')
lines.push('| Route | Methods | Auth | Validation markers | External deps | File |')
lines.push('|---|---:|---|---|---|---|')
for (const row of cmsRows) {
  lines.push(`| \`${row.route}\` | ${row.methods.join(', ') || 'none'} | ${row.auth} | ${row.validation} | ${row.external || ''} | \`${row.file}\` |`)
}
lines.push('')
lines.push('## CMS → Growth Tools calls')
lines.push('')
lines.push('| CMS route | Method | Growth Tools path | Matched Growth Tools route | CMS file |')
lines.push('|---|---|---|---|---|')
for (const row of growthToolsCallRows) {
  lines.push(`| \`${row.cmsRoute}\` | ${row.method} | \`${row.path}\` | ${row.matchedGrowthToolsRoute ? `\`${row.matchedGrowthToolsRoute}\`` : '⚠️ unmatched'} | \`${row.cmsFile}\` |`)
}
lines.push('')
lines.push('## Growth Tools endpoints')
lines.push('')
lines.push(`Source repo: \`${growthToolsRoot}\``)
lines.push('')
lines.push('| Method | Path | File |')
lines.push('|---|---|---|')
for (const row of growthToolRoutes) {
  lines.push(`| ${row.method} | \`${row.path}\` | \`${row.file}\` |`)
}
lines.push('')
lines.push('## Machine-readable summary')
lines.push('')
lines.push('```json')
lines.push(JSON.stringify({ generatedAt: new Date().toISOString(), cmsRows, growthToolRoutes, growthToolsCallRows, unmatchedGrowthToolsCalls }, null, 2))
lines.push('```')

writeFileSync('docs/api-endpoint-inventory.md', `${lines.join('\n')}\n`)
console.log(`Wrote docs/api-endpoint-inventory.md (${cmsRows.length} CMS endpoints, ${growthToolRoutes.length} Growth Tools endpoints)`)
