import { relationshipIdString as relationshipId } from "@/lib/relationship-id"
export { relationshipId }
export type MonthlyNegativeKeywordsRelationshipValue =
  | string
  | number
  | { id?: string | number; value?: string | number | { id?: string | number }; relationTo?: string }
  | null
  | undefined

