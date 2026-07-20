export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonday(date: Date): Date {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (localDate.getDay() + 6) % 7;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  return localDate;
}

export function getThisWeekRange(today = new Date()): { start: string; end: string } {
  const monday = getMonday(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: formatDateOnly(monday),
    end: formatDateOnly(sunday),
  };
}

export function getLastWeekRange(today = new Date()): { start: string; end: string } {
  const thisMonday = getMonday(today);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    start: formatDateOnly(lastMonday),
    end: formatDateOnly(lastSunday),
  };
}

export function normalizeDashboardRange(range: string, today = new Date()): string {
  if (range === "this_week") {
    const { start, end } = getThisWeekRange(today);
    return `custom:${start},${end}`;
  }
  if (range === "last_week") {
    const { start, end } = getLastWeekRange(today);
    return `custom:${start},${end}`;
  }
  return range;
}
