/**
 * URL contract between the OptiMate launcher's pop-out button and the
 * `/optimate-popout` page, so a popped-out GoogleMate chat resumes the exact
 * conversations (and tab) the launcher had open instead of starting fresh.
 *
 *   /optimate-popout?audits=12,34&sessionIds=a,b&selectedSessionId=c&active=selected-accounts
 *   /optimate-popout?mode=portfolio&sessionIds=a
 *
 * - sessionIds: parallel to `audits` by position (empty = fresh thread).
 * - selectedSessionId: the synthetic "Selected accounts" tab shown when two or
 *   more accounts are open. It is the default tab, so without it the main
 *   multi-account conversation always reopened empty.
 * - active: the tab the user was looking at.
 */

/** Tab id of the synthetic multi-account tab in OptiMateMultiChat. */
export const SELECTED_ACCOUNTS_TAB_ID = "selected-accounts";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Accept only plain id tokens (UUIDs, numeric ids); anything else is dropped. */
export function parsePopoutId(raw: string | undefined | null): string | undefined {
  const value = (raw ?? "").trim();
  return SAFE_ID.test(value) ? value : undefined;
}

export function buildGoogleMatePopoutUrl(args: {
  portfolio: boolean;
  auditIds: Array<string | number>;
  /** Tab id → live sessionId, from OptiMateMultiChat's handle. */
  sessionMap: Record<string, string>;
  activeTabId?: string;
}): string {
  const params = new URLSearchParams();
  if (args.portfolio) {
    params.set("mode", "portfolio");
    const sid = parsePopoutId(args.sessionMap.portfolio);
    if (sid) params.set("sessionIds", sid);
    return `/optimate-popout?${params.toString()}`;
  }

  const ids = args.auditIds.map(String);
  params.set("audits", ids.join(","));
  const sessionIds = ids.map((id) => parsePopoutId(args.sessionMap[id]) ?? "");
  if (sessionIds.some(Boolean)) params.set("sessionIds", sessionIds.join(","));
  const selectedSid = parsePopoutId(args.sessionMap[SELECTED_ACCOUNTS_TAB_ID]);
  if (selectedSid) params.set("selectedSessionId", selectedSid);
  const active = parsePopoutId(args.activeTabId);
  if (active) params.set("active", active);
  return `/optimate-popout?${params.toString()}`;
}
