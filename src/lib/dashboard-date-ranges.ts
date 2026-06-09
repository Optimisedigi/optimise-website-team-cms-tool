export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLastWeekRange(today = new Date()): { start: string; end: string } {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = date.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(date);
  thisMonday.setDate(date.getDate() - daysSinceMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    start: formatDateOnly(lastMonday),
    end: formatDateOnly(lastSunday),
  };
}

export function normalizeDashboardRange(range: string): string {
  if (range !== "last_week") return range;
  const { start, end } = getLastWeekRange();
  return `custom:${start},${end}`;
}
