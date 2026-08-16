/**
 * Renders the copy-paste DNS instruction email for a landing domain mapping.
 *
 * Format follows the manually written fastdns email that first onboarded
 * hire.awaydigitalteams.com: a record table, an exact-value warning, the
 * trailing-dot note, and an explicit do-not-change list — because the person
 * applying this works in a registrar UI we cannot see, and every ambiguity
 * becomes a support round-trip.
 */

/**
 * Which DNS record the client must create for this hostname.
 *
 * Subdomains use the project-specific CNAME target from Vercel's config
 * endpoint — never the generic cname.vercel-dns.com, which fails verification
 * on newer projects.
 *
 * simplification: an apex is assumed to be the last two labels, which is wrong
 * for e.g. co.uk domains; every client domain so far is a plain .com/.online.
 * Upgrade path: a public-suffix list lookup.
 */
export function deriveDnsRecord(
  hostname: string,
  recommendedCNAME: string | null,
): { type: string; name: string; value: string } | null {
  const labels = hostname.split(".");
  if (labels.length >= 3) {
    if (!recommendedCNAME) return null;
    return { type: "CNAME", name: labels.slice(0, -2).join("."), value: recommendedCNAME };
  }
  // Apex domains cannot CNAME; Vercel's anycast A record is stable.
  return { type: "A", name: "@", value: "76.76.21.21" };
}

export interface DomainInstructionInput {
  hostname: string;
  dnsRecordType: string;
  dnsRecordName: string;
  dnsRecordValue: string;
  verificationTxt?: string | null;
}

export function renderDomainInstructions(input: DomainInstructionInput): string {
  const { hostname, dnsRecordType, dnsRecordName, dnsRecordValue, verificationTxt } = input;

  const rows: string[][] = [[dnsRecordType, dnsRecordName, dnsRecordValue, "Default (or 3600)"]];
  if (verificationTxt) {
    rows.push(["TXT", `_vercel.${hostname.split(".").slice(-2).join(".")}`, verificationTxt, "Default (or 3600)"]);
  }

  const header = ["Type", "Name / Host", "Value / Target", "TTL"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  const table = [
    line(header),
    `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`,
    ...rows.map(line),
  ].join("\n");

  return `Hi,

To put the new landing page live on ${hostname}, please add the following DNS record${verificationTxt ? "s" : ""} at your domain registrar (wherever the DNS for ${hostname.split(".").slice(-2).join(".")} is managed):

${table}

Important notes:

1. The value must be entered EXACTLY as shown above — please copy and paste it. A similar-looking generic value will not work for this setup.
2. Some DNS providers require a trailing dot at the end of the value (e.g. "${dnsRecordValue}."). If your provider's interface rejects the value without one, add the trailing dot.
3. Some providers want only "${dnsRecordName}" in the Name field, others want the full "${hostname}". If one form is rejected, use the other.
${verificationTxt ? "4. The TXT record is a one-time ownership verification and can be removed once we confirm the domain is live.\n" : ""}
Please do NOT change anything else, in particular:
- Do not change your nameservers.
- Do not touch the root/apex record or the www record for your main website.
- Do not modify any MX (email) records — your email will keep working as long as these stay untouched.

Once the record is in place, let us know and we will confirm the domain is live from our side. DNS changes can take up to a few hours to propagate.

Thanks!`;
}
