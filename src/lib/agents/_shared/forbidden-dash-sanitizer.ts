/**
 * Enforces OptiMate's shared formatting rule at output boundaries. Models are
 * instructed not to use typographic dashes, but this makes the rule deterministic.
 */
export function removeForbiddenDashes(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ");
}

export function containsForbiddenDash(text: string): boolean {
  return /[—–]/.test(text);
}
