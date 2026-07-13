const LEGACY_VALUE_TO_ID: Record<string, string> = {
  '1': '01',
  '2': '02',
  '3': '04',
  '4': '04b',
  '5': '06',
  '6': '10',
  '7': '09',
  '8': '15',
  '9': '15',
  '10': '14',
  '11': '14',
  '12': '14',
  '13': '17',
  '14': '18',
  '15': '20',
  '16': '22',
  '17': '24',
  '18': '24',
  '19': '27',
}

export function normaliseSlideId(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  if (/^\d+$/.test(raw) && LEGACY_VALUE_TO_ID[raw]) return LEGACY_VALUE_TO_ID[raw]
  const firstToken = raw.split(/\s+/)[0] ?? raw
  if (/^\d+$/.test(firstToken)) return firstToken.padStart(2, '0')
  const numericPrefix = firstToken.match(/^0?(\d+)([a-z])$/)
  if (numericPrefix) return `${numericPrefix[1].padStart(2, '0')}${numericPrefix[2]}`
  return firstToken
}
