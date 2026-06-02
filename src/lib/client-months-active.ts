/**
 * Compute how many whole months a client has been active, from their
 * `clientStartDate` to a reference date (defaults to now).
 *
 * Used by the `monthsActive` virtual field on the Clients collection to feed
 * the "Months Active" column in the admin list view. Pure and clock-injectable
 * so it can be unit-tested deterministically.
 */
export function monthsActiveFrom(
  clientStartDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!clientStartDate) return null

  const start = clientStartDate instanceof Date ? clientStartDate : new Date(clientStartDate)
  if (Number.isNaN(start.getTime())) return null
  if (start.getTime() > now.getTime()) return 0

  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())

  // Subtract a month if we haven't yet reached the day-of-month anniversary.
  if (now.getDate() < start.getDate()) months -= 1

  return months < 0 ? 0 : months
}
