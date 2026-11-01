/**
 * Format a date string (YYYY-MM-DD or ISO) for display.
 */
export function formatDisplayDate(iso: string): string {
  try {
    // Append T00:00:00 so the string is parsed as local midnight, not UTC midnight.
    // Without this, "2024-03-15" is treated as UTC, which shifts back one day
    // in any timezone behind UTC.
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Get YYYY-MM-DD from a Date (local date, not UTC).
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD or ISO string to Date (local midnight).
 */
export function parseDateString(s: string): Date {
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  const [y, m, d] = s.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date();
}

/**
 * Format "YYYY-MM-DD" for a compact day chip, e.g. { dow: "Mon", day: "10" }.
 */
export function formatDayChip(dateStr: string): { dow: string; day: string } {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: String(d.getDate()),
  };
}

/** Generate all YYYY-MM-DD strings between start and end (inclusive). */
export function generateTripDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate.slice(0, 10) + 'T00:00:00');
  const end = new Date(endDate.slice(0, 10) + 'T00:00:00');
  while (cur <= end) {
    days.push(toDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Format "YYYY-MM-DD" → "Monday, Jun 10" */
export function formatDayHeading(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export type TripStatus = 'upcoming' | 'ongoing' | 'past';

/**
 * A trip is archived once its endDate has passed. This is the single definition of "archived" used
 * by trip-list sectioning, the trip-detail status badge, and trip history — a trip counts toward
 * history once, and only once, this is true.
 */
export function isTripArchived(endDate: string, today: string = toDateString(new Date())): boolean {
  return today > endDate;
}

/** Upcoming/ongoing/past, derived from a trip's own dates — not a stored field. */
export function getTripStatus(
  startDate: string,
  endDate: string,
  today: string = toDateString(new Date())
): TripStatus {
  if (today < startDate) return 'upcoming';
  if (isTripArchived(endDate, today)) return 'past';
  return 'ongoing';
}
