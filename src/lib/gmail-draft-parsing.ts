/**
 * Pure string helpers for the /api/gmail/draft route.
 *
 * Lives outside the route file so unit tests can import them without
 * pulling in the Next.js / Payload runtime (which fails to bootstrap
 * inside vitest without the full env).
 */

/**
 * Parse a leading email header block out of the message body. Accepts the
 * `Subject:` / `To:` / `Cc:` / `Bcc:` lines OptiMate emits when asked to
 * draft a reply, in any order, separated from the body by a blank line or
 * the first non-header line. Later occurrences of the same header win.
 *
 * Only the first contiguous run of header-shaped lines (optionally with
 * one leading blank line) is inspected, so a chat message that happens
 * to mention `Subject:` deep in the prose isn't accidentally hoisted.
 *
 * Returns the cleaned body plus any fields that were found.
 */
export function extractEmailHeaders(input: string): {
  body: string;
  subject?: string;
  to?: string;
  cc?: string;
  bcc?: string;
} {
  const lines = input.split("\n");
  const headers: Record<string, string> = {};
  const headerKey = /^(subject|to|cc|bcc)\s*:\s*(.*)$/i;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].replace(/\r$/, "");
    if (line.trim() === "") {
      if (Object.keys(headers).length > 0) {
        // Blank line ends the header block.
        i += 1;
        break;
      }
      // Leading blank line before any header — skip and keep scanning.
      i += 1;
      continue;
    }
    const m = line.match(headerKey);
    if (!m) break;
    headers[m[1].toLowerCase()] = m[2].trim();
    i += 1;
  }

  if (Object.keys(headers).length === 0) {
    return { body: input };
  }

  const body = lines.slice(i).join("\n").replace(/^\n+/, "");
  return {
    body,
    ...(headers.subject ? { subject: headers.subject } : {}),
    ...(headers.to ? { to: headers.to } : {}),
    ...(headers.cc ? { cc: headers.cc } : {}),
    ...(headers.bcc ? { bcc: headers.bcc } : {}),
  };
}

/**
 * Strip OptiMate's habitual closing prompts from the tail of a reply so
 * agent chatter doesn't end up in the client-facing email. Conservative:
 * we only match unambiguous "want me to tweak / let me know if…" sign-offs
 * preceded by either a separator line or just whitespace.
 */
export function stripAgentSignOff(input: string): string {
  let out = input.replace(/\s+$/, "");
  // Separator that may precede the sign-off: "---", em-dash run, or none.
  const sep = "(?:[ \\t]*(?:-{3,}|\u2014+)[ \\t]*\\n+)?";
  out = out.replace(
    new RegExp(
      `\\n+\\s*${sep}\\s*Want me to (?:tweak|adjust|change|edit|polish|refine)[^\\n]*\\??\\s*$`,
      "i",
    ),
    "",
  );
  out = out.replace(
    new RegExp(
      `\\n+\\s*${sep}\\s*Let me know if (?:you'?d like|you want|you need)[^\\n]*\\??\\s*$`,
      "i",
    ),
    "",
  );
  // Bare "---" / "———" left dangling at the end after a strip.
  out = out.replace(/\n+\s*(?:-{3,}|\u2014+)\s*$/, "");
  return out.replace(/\s+$/, "");
}
