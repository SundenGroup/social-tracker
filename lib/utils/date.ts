const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a date using simple format tokens:
 * YYYY - 4-digit year, MM - 2-digit month, DD - 2-digit day,
 * MMM - abbreviated month name,
 * HH - hours, mm - minutes, ss - seconds
 */
export function formatDate(date: Date, format: string): string {
  const y = date.getFullYear();
  const M = date.getMonth();
  const d = date.getDate();
  const H = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();

  return format
    .replace("YYYY", String(y))
    .replace("MMM", MONTHS[M])
    .replace("MM", String(M + 1).padStart(2, "0"))
    .replace("DD", String(d).padStart(2, "0"))
    .replace("HH", String(H).padStart(2, "0"))
    .replace("mm", String(m).padStart(2, "0"))
    .replace("ss", String(s).padStart(2, "0"));
}

/**
 * Parse an ISO 8601 date string into a Date object.
 * Throws if the string is not a valid date.
 */
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return date;
}

export type DateRangeType = "last7days" | "last30days" | "thisMonth" | "custom";

/**
 * Returns a [startDate, endDate] tuple for the given range type.
 * For "custom", both `from` and `to` must be provided.
 */
export function getDateRange(
  type: DateRangeType,
  from?: Date,
  to?: Date
): [Date, Date] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (type) {
    case "last7days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return [start, today];
    }
    case "last30days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return [start, today];
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return [start, today];
    }
    case "custom": {
      if (!from || !to) {
        throw new Error("Custom date range requires both 'from' and 'to' dates");
      }
      return [from, to];
    }
  }
}

/**
 * Returns true if startDate is before or equal to endDate.
 */
export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  return startDate <= endDate;
}
