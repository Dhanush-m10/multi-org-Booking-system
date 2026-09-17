import type { Weekday } from '../models/api.models';

/**
 * Date/time helpers.
 *
 * The API speaks three string formats and none of them are `Date` objects:
 *   booking_date  "YYYY-MM-DD"
 *   start/end_time "HH:MM:SS"
 *   created_at     ISO-8601 UTC
 *
 * Everything here parses those strings by hand instead of relying on
 * `new Date("2026-09-21")`, which is interpreted as UTC midnight and can roll
 * back a day in negative-offset timezones.
 */

export const WEEKDAY_LABELS: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_SHORT: readonly string[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Parse "YYYY-MM-DD" into its parts, or null when malformed. */
export function parseDateParts(iso: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Today's date as "YYYY-MM-DD" in the browser's local timezone. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Weekday of a "YYYY-MM-DD" date using the backend's numbering
 * (Monday = 0 ... Sunday = 6), matching `WorkingHours.WeekDay`.
 * Returns null for an unparsable date.
 */
export function isoToWeekday(iso: string): Weekday | null {
  const parts = parseDateParts(iso);
  if (!parts) {
    return null;
  }
  const jsDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  // JS: Sunday = 0 ... Saturday = 6  ->  backend: Monday = 0 ... Sunday = 6
  return ((jsDay + 6) % 7) as Weekday;
}

/** "YYYY-MM-DD" -> "Mon, 21 Sep 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const parts = parseDateParts(iso);
  if (!parts) {
    return iso;
  }
  const weekday = isoToWeekday(iso);
  const label = weekday === null ? '' : `${WEEKDAY_SHORT[weekday]}, `;
  return `${label}${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** "YYYY-MM-DD" -> "21 Sep 2026" (no weekday). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const parts = parseDateParts(iso);
  if (!parts) {
    return iso;
  }
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** ISO-8601 UTC -> "17 Sep 2026, 05:31" in the browser's timezone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${formatDateShort(
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  )}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Relative label such as "in 3 days" / "today" / "2 days ago". */
export function relativeDay(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const parts = parseDateParts(iso);
  if (!parts) {
    return '';
  }
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  const now = new Date();
  const current = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target - current) / 86_400_000);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** "HH:MM:SS" -> "HH:MM" (drops the seconds the API always appends). */
export function formatTime(time: string | null | undefined): string {
  if (!time) {
    return '—';
  }
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? `${match[1]}:${match[2]}` : time;
}

/** "HH:MM:SS" -> "HH:MM" for `<input type="time">`. */
export function toInputTime(time: string | null | undefined): string {
  return formatTime(time);
}

/** "HH:MM" -> "HH:MM:SS" for the API. */
export function toApiTime(time: string | null | undefined): string {
  if (!time) {
    return '';
  }
  return time.length === 5 ? `${time}:00` : time;
}

/** Total minutes since midnight for "HH:MM" / "HH:MM:SS". */
export function timeToMinutes(time: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time ?? '');
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight -> "HH:MM", clamped to the same day. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/**
 * Preview of the booking end time.
 *
 * The backend is authoritative — `end_time` is read-only and recomputed from
 * `service.duration_minutes` on every write. This helper only lets the create
 * form *show* the user what will happen; the value is never submitted.
 */
export function addMinutesToTime(time: string | null | undefined, minutes: number): string | null {
  const start = timeToMinutes(time);
  if (start === null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutesToTime(start + minutes);
}

/** Human label for a duration, e.g. 90 -> "1h 30m". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "15.00" -> "$15.00". Currency symbol is a display concern only. */
export function formatPrice(price: string | number | null | undefined): string {
  if (price === null || price === undefined || price === '') {
    return '—';
  }
  const value = typeof price === 'string' ? Number(price) : price;
  if (Number.isNaN(value)) {
    return '—';
  }
  return `$${value.toFixed(2)}`;
}

/** Is `iso` today, in the browser's local timezone? */
export function isToday(iso: string | null | undefined): boolean {
  return !!iso && iso === todayIso();
}

/** Chronological comparator for bookings (date, then start time). */
export function compareBookingTimes(
  a: { booking_date: string; start_time: string },
  b: { booking_date: string; start_time: string },
): number {
  if (a.booking_date !== b.booking_date) {
    return a.booking_date < b.booking_date ? -1 : 1;
  }
  return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
}

/** "John Doe" -> "JD"; single-word names fall back to their first two letters. */
export function initials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** "Good morning" / "Good afternoon" / "Good evening" for the dashboard. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
