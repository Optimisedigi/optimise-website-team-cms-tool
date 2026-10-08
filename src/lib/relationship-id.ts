/**
 * Helpers for unwrapping Payload relationship field values.
 *
 * Depending on `depth`, a relationship is delivered as a bare id
 * (`number | string`), a populated document (`{ id, ... }`), or — for
 * polymorphic relationships — `{ relationTo, value }` where `value` is
 * again either an id or a populated document.
 *
 * These used to be re-implemented in ~28 files with inconsistent null /
 * undefined / '' conventions. Pick the variant whose return shape matches
 * the call site; none of them perform I/O.
 */

/** Bare id or populated doc → id. Missing/invalid → `null`. */
export function relationshipId(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "number" || typeof id === "string" ? id : null;
  }
  return null;
}

/**
 * Like {@link relationshipId} but also unwraps polymorphic
 * `{ relationTo, value }` shapes and always returns a string.
 */
export function relationshipIdString(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const obj = value as { id?: unknown; value?: unknown };
    if (typeof obj.id === "string" || typeof obj.id === "number") return String(obj.id);
    if (typeof obj.value === "string" || typeof obj.value === "number") return String(obj.value);
    if (obj.value && typeof obj.value === "object") {
      const nestedId = (obj.value as { id?: unknown }).id;
      if (typeof nestedId === "string" || typeof nestedId === "number") return String(nestedId);
    }
  }
  return null;
}

/**
 * Coerce a form/query value to a numeric id when it looks numeric,
 * otherwise pass it through. Empty → `undefined`. Does NOT unwrap objects.
 */
export function coerceRelationshipKey(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

/**
 * Unwrap a relationship (bare id or populated doc) and coerce numeric
 * strings to numbers, so the result can be used directly as a Payload
 * `where`/`id` key. Missing/empty → `undefined`.
 */
export function relationshipKey(value: unknown): string | number | undefined {
  const key = coerceRelationshipKey(relationshipId(value));
  return typeof key === "string" || typeof key === "number" ? key : undefined;
}
