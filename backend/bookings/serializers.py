from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework import serializers

from availability.models import WorkingHours
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):

    class Meta:
        model = Booking

        fields = [
            "id",
            "organization",
            "customer",
            "service",
            "staff",
            "booking_date",
            "start_time",
            "end_time",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "organization",
            "end_time",
            "created_at",
            "updated_at",
        ]

    def validate(self, data):

        organization = self.context["organization"]

        # -----------------------------------------
        # UPDATE REQUEST
        # -----------------------------------------

        if self.instance:

            # If this is only a status/notes update,
            # don't recalculate booking availability.
            if set(data.keys()).issubset({
                "status",
                "notes",
            }):
                return data

        # -----------------------------------------
        # CREATE / FULL UPDATE
        # -----------------------------------------

        customer = data.get(
            "customer",
            self.instance.customer if self.instance else None
        )

        service = data.get(
            "service",
            self.instance.service if self.instance else None
        )

        staff = data.get(
            "staff",
            self.instance.staff if self.instance else None
        )

        booking_date = data.get(
            "booking_date",
            self.instance.booking_date
            if self.instance else None
        )

        start_time = data.get(
            "start_time",
            self.instance.start_time
            if self.instance else None
        )

        if not all([
            customer,
            service,
            staff,
            booking_date,
            start_time,
        ]):
            raise serializers.ValidationError(
                "Customer, service, staff, booking date and start time are required."
            )

        # -----------------------------------------
        # ORGANIZATION VALIDATION
        # -----------------------------------------

        if customer.organization_id != organization.id:
            raise serializers.ValidationError(
                "Customer does not belong to your organization."
            )

        if service.organization_id != organization.id:
            raise serializers.ValidationError(
                "Service does not belong to your organization."
            )

        if staff.organization_id != organization.id:
            raise serializers.ValidationError(
                "Staff member does not belong to your organization."
            )

        # -----------------------------------------
        # STAFF-SERVICE VALIDATION
        # -----------------------------------------

        if not staff.services.filter(
            id=service.id
        ).exists():

            raise serializers.ValidationError(
                "This staff member does not provide this service."
            )

        # -----------------------------------------
        # DATE VALIDATION
        # -----------------------------------------

        if booking_date < timezone.localdate():

            raise serializers.ValidationError(
                "Booking date cannot be in the past."
            )

        # -----------------------------------------
        # CALCULATE END TIME
        # -----------------------------------------

        start_datetime = datetime.combine(
            booking_date,
            start_time
        )

        end_datetime = (
            start_datetime
            + timedelta(
                minutes=service.duration_minutes
            )
        )

        end_time = end_datetime.time()

        data["end_time"] = end_time

        # -----------------------------------------
        # WORKING HOURS
        # -----------------------------------------

        weekday = booking_date.weekday()

        working_hours = WorkingHours.objects.filter(
            organization=organization,
            staff=staff,
            weekday=weekday,
            is_available=True,
        ).first()

        if not working_hours:

            raise serializers.ValidationError(
                "Staff member is not available on this day."
            )

        if (
            start_time < working_hours.start_time
            or end_time > working_hours.end_time
        ):

            raise serializers.ValidationError(
                "Booking time is outside the staff member's working hours."
            )

        # -----------------------------------------
        # OVERLAPPING BOOKINGS
        # -----------------------------------------

        overlapping_bookings = Booking.objects.filter(
            organization=organization,
            staff=staff,
            booking_date=booking_date,
        ).exclude(
            status=Booking.Status.CANCELLED
        )

        if self.instance:

            overlapping_bookings = (
                overlapping_bookings
                .exclude(id=self.instance.id)
            )

        for booking in overlapping_bookings:

            if (
                start_time < booking.end_time
                and end_time > booking.start_time
            ):

                raise serializers.ValidationError(
                    "Staff member already has a booking during this time."
                )

        return data