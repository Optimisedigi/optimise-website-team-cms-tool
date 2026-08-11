/**
 * Rewrites the canonical Budget Management HTML into its monthly-report form.
 *
 * The budget block is generated for current-month pacing, so a completed-month
 * report has to drop the month-to-date framing (MTD labels, time tracking,
 * adjusted daily budget) and relabel pacing as budget. Shared by the
 * single-account monthly tool and the portfolio monthly path so a completed
 * month renders the same email from every chat surface.
 */
export function prepareMonthlyBudgetBreakdownHtml(html: string): string {
  return html
    .replace(/\s*\(Month-to-Date\)/g, "")
    .replace(/>MTD Spend<\/th>/g, ">Spend</th>")
    .replace(/Behind expected pace by/g, "Under budget by")
    .replace(/Ahead of expected pace by/g, "Over budget by")
    .replace(/Target spend to date/g, "Monthly budget")
    .replace(/Pacing difference/g, "Budget difference")
    .replace(/behind pace\./g, "under budget.")
    .replace(/ahead of pace\./g, "over budget.")
    .replace(/on pace\./g, "on budget.")
    .replace(/\s*<td[^>]*data-budget-time-tracking-cell="1"[^>]*>[\s\S]*?<\/td>/g, "")
    .replace(/data-budget-progress-cell="1"([^>]*)width:64%;/g, 'data-budget-progress-cell="1"$1width:100%;')
    .replace(/\s*<t[hd][^>]*\sdata-col="adjusted-daily-budget"[^>]*>[\s\S]*?<\/t[hd]>/g, "");
}
