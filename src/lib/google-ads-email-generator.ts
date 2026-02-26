/**
 * Google Ads Audit Email Generator (CMS copy)
 *
 * Generates styled HTML email from GoogleAdsAuditResults scored data.
 * Supports optional curation selections so the team can control which
 * findings, recommendations, and quick wins appear in the email.
 *
 * Based on website-growth-tools/server/google-ads-email-generator.ts
 */

import type {
  GoogleAdsAuditResults,
  CurationSelections,
} from "./google-ads-types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDollars(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function scoreColor(score: number, max: number = 100): string {
  const pct = (score / max) * 100;
  if (pct >= 70) return "#2e7d32"; // green
  if (pct >= 45) return "#f57c00"; // amber
  return "#d32f2f"; // red
}

function scoreBadgeColor(score: number): string {
  if (score >= 70) return "#2e7d32";
  if (score >= 45) return "#f57c00";
  return "#d32f2f";
}

interface EmailOptions {
  clientName: string;
  contactName?: string;
  presentationUrl?: string;
}

/**
 * Generate HTML email from scored audit results.
 * When curation is provided, only selected findings/recommendations/quick wins are included.
 */
export function generateGoogleAdsAuditEmail(
  results: GoogleAdsAuditResults,
  options: EmailOptions,
  curation?: CurationSelections,
): string {
  const { clientName, contactName, presentationUrl } = options;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)}` : "Hi";

  // --- Build worst-steps table ---
  // When curated: still show worst 5 steps, but use curated finding for key issue
  const worstSteps = [...results.steps]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const scoreTableRows = worstSteps
    .map((s) => {
      const color = scoreColor(s.score, 10);
      let topFinding = "";
      if (curation) {
        const selectedIndices = curation.stepFindings[s.step] ?? [];
        topFinding = selectedIndices.length > 0
          ? s.findings[selectedIndices[0]] ?? ""
          : "";
      } else {
        topFinding = s.findings[0] || "";
      }
      const shortFinding = topFinding.length > 100
        ? topFinding.slice(0, 97) + "..."
        : topFinding;
      return `<tr>
        <td style="padding:7px 10px;border:1px solid #d0d0d0;">${escapeHtml(s.name)}</td>
        <td style="padding:7px 10px;border:1px solid #d0d0d0;text-align:center;"><span style="color:${color};font-weight:600;">${s.score}</span>/10</td>
        <td style="padding:7px 10px;border:1px solid #d0d0d0;">${escapeHtml(shortFinding)}</td>
      </tr>`;
    })
    .join("\n");

  // --- Top recommendations ---
  let topFindings: string[];
  if (curation) {
    // Flatten selected recommendations from lowest-scoring steps
    const stepsByScore = [...results.steps].sort((a, b) => a.score - b.score);
    topFindings = [];
    for (const s of stepsByScore) {
      const selectedIndices = curation.stepRecommendations[s.step] ?? [];
      for (const idx of selectedIndices) {
        if (s.recommendations[idx]) {
          topFindings.push(s.recommendations[idx]);
        }
      }
      if (topFindings.length >= 3) break;
    }
    topFindings = topFindings.slice(0, 3);
  } else {
    topFindings = worstSteps
      .flatMap((s) => s.recommendations)
      .slice(0, 3);
  }

  const findingsList = topFindings.length > 0
    ? `<ul style="margin:6px 0;padding-left:22px;">
        ${topFindings.map((f) => `<li style="margin:5px 0;">${escapeHtml(f)}</li>`).join("\n")}
       </ul>`
    : "";

  // --- Quick wins ---
  let quickWins: string[];
  if (curation) {
    quickWins = curation.emailQuickWins
      .map((idx) => results.quickWins[idx])
      .filter(Boolean);
  } else {
    quickWins = results.quickWins;
  }

  const quickWinsList = quickWins
    .map((qw) => `<li style="margin:5px 0;">${escapeHtml(qw)}</li>`)
    .join("\n");

  // --- Opportunity section ---
  const avgCpa = results.accountSummary.avgCpa;
  const wasteAmount = results.estimatedMonthlyWaste;
  const opportunityLines: string[] = [];
  if (wasteAmount && wasteAmount > 50) {
    opportunityLines.push(`<strong>${formatDollars(wasteAmount)}/month</strong> in identifiable wasted spend that can be recovered`);
  }
  if (avgCpa) {
    const targetLow = Math.round(avgCpa * 0.6);
    const targetHigh = Math.round(avgCpa * 0.75);
    opportunityLines.push(`Cost per lead potential: <strong>${formatDollars(targetLow)}–${formatDollars(targetHigh)}</strong> (currently ${formatDollars(Math.round(avgCpa))})`);
  }
  opportunityLines.push("Full visibility into ROI once quick wins are implemented");

  const opportunityList = `<ul style="margin:6px 0;padding-left:22px;">
    ${opportunityLines.map((l) => `<li style="margin:5px 0;">${l}</li>`).join("\n")}
  </ul>`;

  // --- CTA ---
  const ctaHtml = presentationUrl
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(presentationUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View Full Audit Presentation</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Google Ads Account Review — ${escapeHtml(clientName)}</title>
<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #222;
    max-width: 700px;
    margin: 40px auto;
    padding: 0 20px;
  }
  h2 {
    font-size: 18px;
    color: #1a1a1a;
    padding-bottom: 6px;
    margin-top: 32px;
  }
  h3 { font-size: 15px; color: #333; margin-top: 20px; margin-bottom: 4px; }
  p { margin: 10px 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #d0d0d0;
    padding: 7px 10px;
    text-align: left;
  }
  th { background-color: #f5f5f5; font-weight: 600; }
</style>
</head>
<body>

<p>${greeting},</p>

<p>Thank you for giving us access to review your Google Ads account. We've completed a preliminary audit and wanted to share our key findings.</p>

<h2>Account health score</h2>

<p>We assessed your account across 13 areas. <strong>Overall score: <span style="display:inline-block;background:${scoreBadgeColor(results.overallScore)};color:#fff;font-size:20px;font-weight:700;padding:6px 16px;border-radius:5px;">${results.overallScore} / 100</span></strong></p>

<p>Well-managed accounts typically score 65–80. The main areas pulling the score down:</p>

<table>
  <thead>
    <tr><th>Area</th><th style="text-align:center;">Score</th><th>Key Issue</th></tr>
  </thead>
  <tbody>
    ${scoreTableRows}
  </tbody>
</table>

<h2>Top recommendations</h2>
${findingsList}

<h2>Quick wins</h2>
<p>These can typically be implemented in the first week:</p>
<ul style="margin:6px 0;padding-left:22px;">
  ${quickWinsList}
</ul>

<h2>The opportunity</h2>
<p>Based on the current monthly spend of ~${formatDollars(Math.round(results.accountSummary.totalSpend / 12))}/month, fixing the issues above would mean:</p>
${opportunityList}

${ctaHtml}

<h2>Next steps</h2>

<p>This is a preliminary review based on the data in your Google Ads account. There's more to explore around conversion tracking setup, landing page performance, and competitive positioning.</p>

<p>If you'd like to discuss these findings or explore what a structured optimisation plan would look like, happy to set up a call.</p>

<p>Kind regards,<br>
Peter<br>
<strong>Optimise Digital</strong><br>
www.optimisedigital.online</p>

</body>
</html>`;
}
