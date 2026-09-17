import type { Booking, WorkingHours } from '../models/api.models';
import { isoToWeekday, minutesToTime, timeToMinutes } from './datetime';

/** A candidate start time, with the end time the backend will derive. */
export interface TimeSlot {
  /** "HH:MM", suitable for display and for `+ ':00'` to reach the API format. */
  start: string;
  /** "HH:MM" — what the server will store as `end_time`. */
  end: string;
  /** False when the slot collides with an existing non-cancelled booking. */
  available: boolean;
  /** Why the slot is unavailable, so the UI can say more than "no". */
  reason: 'booked' | null;
}

/** Slots are offered on this grid rather than at every minute. */
export const DEFAULT_SLOT_STEP_MINUTES = 15;

export interface SlotOptions {
  /** The staff member's hours for the chosen weekday, if any. */
  workingHours: WorkingHours | null | undefined;
  /** Service duration in minutes — the backend uses this to derive end_time. */
  durationMinutes: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** Every booking already loaded for the organization. */
  bookings: Booking[];
  /** Staff member being booked. */
  staffId: number;
  /** Grid spacing. Defaults to 15 minutes. */
  stepMinutes?: number;
  /** Minutes after midnight below which slots are dropped (e.g. "now"). */
  notBeforeMinutes?: number | null;
}

/**
 * Compute the bookable time slots for one staff member on one date.
 *
 * This deliberately reproduces the backend's own arithmetic from
 * `bookings/serializers.py` so the picker and the server agree:
 *
 *   working hours : valid  <=>  start >= wh.start_time  AND  end <= wh.end_time
 *                   (otherwise "Booking time is outside the staff member's
 *                    working hours.")
 *
 *   overlap       : conflict <=> start < booking.end_time
 *                                AND end > booking.start_time
 *                   over bookings for the same staff and date, excluding those
 *                   with status CANCELLED
 *                   (otherwise "Staff member already has a booking during
 *                    this time.")
 *
 * Two consequences worth stating:
 *  - `end_time` is never an input. It is `start + duration`, exactly as the
 *    server computes it, and is shown only as a preview.
 *  - This is a convenience, not an authority. The server re-validates on
 *    submit and may still reject a slot — for instance if someone else booked
 *    it in the meantime. Callers must surface that rejection.
 *
 * Returns an empty list when there is nothing sensible to offer (no hours
 * configured for that weekday, no duration, or an unparseable date).
 */
export function computeTimeSlots(options: SlotOptions): TimeSlot[] {
  const {
    workingHours,
    durationMinutes,
    date,
    bookings,
    staffId,
    stepMinutes = DEFAULT_SLOT_STEP_MINUTES,
    notBeforeMinutes = null,
  } = options;

  if (!workingHours || !workingHours.is_available) {
    return [];
  }
  if (!durationMinutes || durationMinutes <= 0) {
    return [];
  }
  if (isoToWeekday(date) === null) {
    return [];
  }

  const dayStart = timeToMinutes(workingHours.start_time);
  const dayEnd = timeToMinutes(workingHours.end_time);
  if (dayStart === null || dayEnd === null) {
    return [];
  }

  // Busy intervals for this staff member on this date. CANCELLED bookings free
  // the slot, matching the backend's `.exclude(status=CANCELLED)`.
  const busy: Array<[number, number]> = bookings
    .filter(
      (booking) =>
        booking.staff === staffId &&
        booking.booking_date === date &&
        booking.status !== 'CANCELLED',
    )
    .map((booking): [number, number] => [
      timeToMinutes(booking.start_time) ?? 0,
      timeToMinutes(booking.end_time) ?? 0,
    ])
    .filter(([start, end]) => end > start);

  const earliest =
    notBeforeMinutes !== null && notBeforeMinutes > dayStart ? notBeforeMinutes : dayStart;

  const slots: TimeSlot[] = [];
  // `start + duration` must fit inside the working day, so the last candidate
  // is `dayEnd - duration`.
  for (let start = earliest; start + durationMinutes <= dayEnd; start += stepMinutes) {
    const end = start + durationMinutes;
    const booked = busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart);

    slots.push({
      start: minutesToTime(start),
      end: minutesToTime(end),
      available: !booked,
      reason: booked ? 'booked' : null,
    });
  }

  return slots;
}

/** Convenience for templates: how many slots are actually bookable. */
export function countAvailable(slots: readonly TimeSlot[]): number {
  return slots.reduce((total, slot) => (slot.available ? total + 1 : total), 0);
}
