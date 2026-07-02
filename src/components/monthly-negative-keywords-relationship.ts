export type MonthlyNegativeKeywordsRelationshipValue =
  | string
  | number
  | { id?: string | number; value?: string | number | { id?: string | number }; relationTo?: string }
  | null
  | undefined

export function relationshipId(value: MonthlyNegativeKeywordsRelationshipValue): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if (typeof value.id === 'string' || typeof value.id === 'number') return String(value.id)
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value)
    if (value.value && typeof value.value === 'object') {
      const nestedId = value.value.id
      if (typeof nestedId === 'string' || typeof nestedId === 'number') return String(nestedId)
    }
  }
  return null
}
