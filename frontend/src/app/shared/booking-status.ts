import type { BookingStatus } from '../core/models/api.models';

/**
 * The single definition of how each booking status looks and reads.
 *
 * Colours follow the design brief:
 *   PENDING   -> amber      CONFIRMED -> green
 *   CANCELLED -> red        COMPLETED -> blue
 *   NO_SHOW   -> grey/red
 *
 * Components must use this map rather than hard-coding classes, so a status can
 * never be styled two different ways on two different screens.
 */

export interface StatusStyle {
  /** Short label used in badges. */
  label: string;
  /** Longer label used in filters and detail views. */
  longLabel: string;
  /** Badge utility classes (background + text + ring). */
  badge: string;
  /** Solid dot colour, for charts and timelines. */
  dot: string;
  /** Bar colour for the status-distribution chart. */
  bar: string;
}

export const BOOKING_STATUS_STYLES: Record<BookingStatus, StatusStyle> = {
  PENDING: {
    label: 'Pending',
    longLabel: 'Pending confirmation',
    badge: 'bg-pending-50 text-pending-800 ring-1 ring-pending-600/20 ring-inset',
    dot: 'bg-pending-600',
    bar: 'bg-pending-600',
  },
  CONFIRMED: {
    label: 'Confirmed',
    longLabel: 'Confirmed',
    badge: 'bg-confirmed-50 text-confirmed-800 ring-1 ring-confirmed-600/20 ring-inset',
    dot: 'bg-confirmed-600',
    bar: 'bg-confirmed-600',
  },
  CANCELLED: {
    label: 'Cancelled',
    longLabel: 'Cancelled',
    badge: 'bg-danger-50 text-danger-800 ring-1 ring-danger-600/20 ring-inset',
    dot: 'bg-danger-600',
    bar: 'bg-danger-600',
  },
  COMPLETED: {
    label: 'Completed',
    longLabel: 'Completed',
    badge: 'bg-brand-50 text-brand-800 ring-1 ring-brand-600/20 ring-inset',
    dot: 'bg-brand-600',
    bar: 'bg-brand-600',
  },
  NO_SHOW: {
    label: 'No show',
    longLabel: 'No show',
    badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-500/20 ring-inset',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
  },
};

/** All statuses in the order they should appear in filters. */
export const BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

/**
 * Guard against an unexpected value coming off the wire: the backend could add a
 * status later, and a missing map entry must not blow up the template.
 */
export function statusStyle(status: BookingStatus | string): StatusStyle {
  return (
    BOOKING_STATUS_STYLES[status as BookingStatus] ?? {
      label: String(status || 'Unknown'),
      longLabel: String(status || 'Unknown'),
      badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-500/20 ring-inset',
      dot: 'bg-slate-400',
      bar: 'bg-slate-400',
    }
  );
}
