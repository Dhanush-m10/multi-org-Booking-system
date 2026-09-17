import { describe, expect, it } from 'vitest';

import type { Booking, WorkingHours } from '../models/api.models';
import { computeTimeSlots, countAvailable } from './slots';

/** Monday 09:00-17:00 for staff 1. */
const hours: WorkingHours = {
  id: 1,
  organization: 1,
  staff: 1,
  weekday: 0,
  start_time: '09:00:00',
  end_time: '17:00:00',
  is_available: true,
};

/** 2026-09-21 is a Monday. */
const MONDAY = '2026-09-21';

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    organization: 1,
    customer: 1,
    service: 1,
    staff: 1,
    booking_date: MONDAY,
    start_time: '09:00:00',
    end_time: '09:30:00',
    status: 'CONFIRMED',
    notes: '',
    created_at: '2026-09-17T00:00:00Z',
    updated_at: '2026-09-17T00:00:00Z',
    ...overrides,
  };
}

const base = {
  workingHours: hours,
  durationMinutes: 30,
  date: MONDAY,
  bookings: [] as Booking[],
  staffId: 1,
  stepMinutes: 60,
};

describe('computeTimeSlots', () => {
  it('fills the working day and derives the end time from the duration', () => {
    const slots = computeTimeSlots(base);

    expect(slots.map((slot) => slot.start)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
    // 09:00 + 30 min = 09:30, exactly what the backend stores as end_time.
    expect(slots[0]).toMatchObject({ start: '09:00', end: '09:30', available: true });
    // 17:00 cannot host a 30-minute appointment, so 16:30 is the last start.
    expect(slots[slots.length - 1]).toMatchObject({ start: '16:00', end: '16:30' });
  });

  it('drops a slot that overlaps an existing booking', () => {
    // Existing 09:00-09:30. A 09:00 start overlaps; 10:00 does not.
    const slots = computeTimeSlots({
      ...base,
      bookings: [booking({ start_time: '09:00:00', end_time: '09:30:00' })],
    });

    expect(slots.find((slot) => slot.start === '09:00')).toMatchObject({
      available: false,
      reason: 'booked',
    });
    expect(slots.find((slot) => slot.start === '10:00')?.available).toBe(true);
  });

  it('treats touching bookings as non-overlapping, matching the backend', () => {
    // Existing 10:00-10:30. A 09:30-10:00 slot ends exactly when it starts.
    // The backend test is `start < end AND end > start`, so this is free.
    const slots = computeTimeSlots({
      ...base,
      bookings: [booking({ start_time: '10:00:00', end_time: '10:30:00' })],
      durationMinutes: 30,
      stepMinutes: 30,
    });

    expect(slots.find((slot) => slot.start === '09:30')).toMatchObject({
      end: '10:00',
      available: true,
    });
    expect(slots.find((slot) => slot.start === '10:00')?.available).toBe(false);
  });

  it('frees a slot once the blocking booking is cancelled', () => {
    const cancelled = booking({
      start_time: '09:00:00',
      end_time: '09:30:00',
      status: 'CANCELLED',
    });

    const slots = computeTimeSlots({ ...base, bookings: [cancelled] });
    expect(slots.find((slot) => slot.start === '09:00')?.available).toBe(true);
  });

  it('ignores bookings belonging to another staff member', () => {
    const slots = computeTimeSlots({
      ...base,
      bookings: [booking({ staff: 2, start_time: '09:00:00', end_time: '09:30:00' })],
    });

    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it('ignores bookings on another date', () => {
    const slots = computeTimeSlots({
      ...base,
      bookings: [booking({ booking_date: '2026-09-22', start_time: '09:00:00' })],
    });

    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it('returns nothing when the staff member has no hours that day', () => {
    expect(computeTimeSlots({ ...base, workingHours: null })).toEqual([]);
    expect(computeTimeSlots({ ...base, workingHours: { ...hours, is_available: false } })).toEqual(
      [],
    );
  });

  it('returns nothing when the service is longer than the working day', () => {
    const slots = computeTimeSlots({ ...base, durationMinutes: 60 * 9 });
    expect(slots).toEqual([]);
  });

  it('returns nothing for an unparseable date', () => {
    expect(computeTimeSlots({ ...base, date: 'not-a-date' })).toEqual([]);
  });

  it('honours notBeforeMinutes so past slots are not offered today', () => {
    // Working day starts 09:00, but it is already 11:20.
    const slots = computeTimeSlots({ ...base, notBeforeMinutes: 11 * 60 + 20 });

    expect(slots[0]?.start).toBe('11:20');
    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it('counts only the bookable slots', () => {
    const slots = computeTimeSlots({
      ...base,
      bookings: [booking({ start_time: '09:00:00', end_time: '09:30:00' })],
    });

    expect(slots).toHaveLength(8);
    expect(countAvailable(slots)).toBe(7);
  });
});
