/**
 * Back-compat shim. The canonical renderer is now
 * `src/lib/google-ads-weekly-metric-table.ts` (multi-metric, optional WoW
 * deltas). This file re-exports the legacy names so any in-flight imports
 * keep compiling - the new file is the single source of truth.
 *
 * To migrate: import from `@/lib/google-ads-weekly-metric-table` and call
 * `generateWeeklyMetricTableHtml({ rows, metrics: [...] })` directly.
 */

export {
  buildWeeklyTrendRows,
  generateWeeklyTrendNoteHtml,
  type WeeklyTrendRow,
} from "./google-ads-weekly-metric-table";
