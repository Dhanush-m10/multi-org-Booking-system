"""Availability slot computation.

Mirrors `frontend/src/app/core/utils/slots.ts`, which itself mirrors the
arithmetic in `bookings/serializers.py`, so the picker, this endpoint and the
booking validation all agree:

    working hours : valid  <=>  start >= wh.start_time
                                AND start + duration <= wh.end_time

    overlap       : conflict <=> start < booking.end_time
                                 AND end > booking.start_time
                    over bookings for the same staff and date, excluding those
                    with status CANCELLED

The server remains the authority: this helper only decides what to *offer*.
`BookingSerializer.validate()` re-checks everything on submit.
"""

from datetime import datetime, time

SLOT_STEP_MINUTES = 15


def time_to_minutes(value):
    """`datetime.time` -> minutes after midnight, or None."""
    if value is None:
        return None
    return value.hour * 60 + value.minute


def minutes_to_time(minutes):
    """Minutes after midnight -> `datetime.time`."""
    return time(hour=minutes // 60, minute=minutes % 60)


def compute_slots(
    working_hours,
    duration_minutes,
    booking_date,
    busy_bookings,
    now=None,
    step_minutes=SLOT_STEP_MINUTES,
):
    """
    Return the slots offered for one staff member on one date.

    `working_hours`      the WorkingHours row for that staff and weekday, or None
    `duration_minutes`   the service duration; also the implied end offset
    `booking_date`       a `datetime.date`
    `busy_bookings`      bookings for that staff and date, already excluding
                         CANCELLED (the caller decides, so the rule stays in one
                         place next to the booking query)
    `now`                optional aware-or-naive datetime; when supplied, slots
                         that have already started today are not offered

    Each slot is `{"start": time, "end": time, "available": bool, "reason": ...}`.
    """

    if working_hours is None or not working_hours.is_available:
        return []

    if not duration_minutes or duration_minutes <= 0:
        return []

    day_start = time_to_minutes(working_hours.start_time)
    day_end = time_to_minutes(working_hours.end_time)

    if day_start is None or day_end is None:
        return []

    busy = []
    for booking in busy_bookings:
        start = time_to_minutes(booking.start_time)
        end = time_to_minutes(booking.end_time)
        if start is None or end is None or end <= start:
            continue
        busy.append((start, end))

    earliest = day_start

    # Do not offer slots that have already begun today. This only ever removes
    # options; the past-date rule in BookingSerializer still applies on submit.
    if now is not None and now.date() == booking_date:
        now_minutes = now.hour * 60 + now.minute
        if now_minutes > earliest:
            # Round up to the grid so the offered times stay on 15-minute marks.
            earliest = -(-now_minutes // step_minutes) * step_minutes

    slots = []
    start = earliest

    while start + duration_minutes <= day_end:
        end = start + duration_minutes
        booked = any(start < busy_end and end > busy_start for busy_start, busy_end in busy)

        slots.append(
            {
                "start": minutes_to_time(start),
                "end": minutes_to_time(end),
                "available": not booked,
                "reason": "booked" if booked else None,
            }
        )

        start += step_minutes

    return slots
