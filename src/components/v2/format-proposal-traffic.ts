export function formatProposalTraffic(value: number): string {
  if (value <= 0) return ''
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} million`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}
