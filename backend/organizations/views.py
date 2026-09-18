"""Public, unauthenticated customer-facing organization endpoints.

Everything here is read-only and `AllowAny`. It is the only part of the API a
visitor can reach without a token, so it exposes the minimum needed to browse
and book: the organization's public profile, its active services, the staff who
can perform them, their working hours, and real availability.

Organization isolation applies here too: every queryset is filtered by the
organization resolved from the URL slug, so a slug can never surface another
organization's services, staff or bookings.
"""


from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from availability.models import WorkingHours
from availability.slots import compute_slots
from bookings.models import Booking
from services.models import Service
from staff.models import Staff

from .models import Organization
from .serializers import (
    PublicOrganizationSerializer,
    PublicServiceSerializer,
    PublicStaffSerializer,
    PublicWorkingHoursSerializer,
)


class PublicOrganizationMixin:
    """Resolves the organization from the URL slug and scopes every query to it."""

    permission_classes = [AllowAny]

    # These are the only unauthenticated endpoints in the API, so they are the
    # only ones that need rate limiting. Scoped throttling keys on the client IP
    # for anonymous callers; the rates live in
    # `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` and are configurable through
    # THROTTLE_PUBLIC_ORGANIZATION / THROTTLE_PUBLIC_AVAILABILITY.
    #
    # Authenticated management endpoints are deliberately not throttled here:
    # a signed-in organization legitimately issues bursts of requests, and its
    # identity is already known.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_organization"

    def get_organization(self):
        # get_object_or_404 rather than a filter on a request-supplied id: the
        # slug in the path is the only organization selector a visitor controls,
        # and it can only ever select one published organization.
        if not hasattr(self, "_organization"):
            self._organization = get_object_or_404(
                Organization, slug=self.kwargs["slug"]
            )
        return self._organization


class PublicOrganizationDetailView(PublicOrganizationMixin, generics.RetrieveAPIView):
    serializer_class = PublicOrganizationSerializer
    lookup_field = "slug"
    queryset = Organization.objects.all()


class PublicServiceListView(PublicOrganizationMixin, generics.ListAPIView):
    serializer_class = PublicServiceSerializer

    def get_queryset(self):
        # Only active services: an inactive service must not be bookable, and
        # should not be advertised either.
        return (
            Service.objects
            .filter(organization=self.get_organization(), is_active=True)
            .select_related("category")
            .order_by("category__name", "name")
        )


class PublicStaffListView(PublicOrganizationMixin, generics.ListAPIView):
    serializer_class = PublicStaffSerializer

    def get_queryset(self):
        return (
            Staff.objects
            .filter(organization=self.get_organization(), is_active=True)
            .prefetch_related("services")
            .order_by("name")
        )


class PublicWorkingHoursListView(PublicOrganizationMixin, generics.ListAPIView):
    serializer_class = PublicWorkingHoursSerializer

    def get_queryset(self):
        return (
            WorkingHours.objects
            .filter(
                organization=self.get_organization(),
                is_available=True,
                staff__is_active=True,
            )
            .select_related("staff")
            .order_by("staff_id", "weekday")
        )


class PublicAvailabilitySlotsView(PublicOrganizationMixin, APIView):
    """
    GET /api/public/organizations/<slug>/availability/slots/
        ?service=<id>&staff=<id>&date=YYYY-MM-DD

    Returns the real bookable slots for one service, one staff member, one date,
    derived from that staff member's working hours, the service duration and
    their existing non-cancelled bookings.

    No fake slots: if there are no working hours for that weekday, the service
    does not fit, or the day is fully booked, the slot list is empty.
    """

    # Tighter limit than the plain reads: this endpoint runs three queries and
    # recomputes the whole day's slots on every call.
    throttle_scope = "public_availability"

    def get(self, request, slug):
        organization = self.get_organization()

        service = get_object_or_404(
            Service,
            organization=organization,
            is_active=True,
            pk=self._int_param(request, "service"),
        )

        staff = get_object_or_404(
            Staff,
            organization=organization,
            is_active=True,
            pk=self._int_param(request, "staff"),
        )

        booking_date = parse_date(request.query_params.get("date") or "")

        if booking_date is None:
            return Response(
                {"date": ["A valid date in YYYY-MM-DD format is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking_date < timezone.localdate():
            return Response(
                {"date": ["Booking date cannot be in the past."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        working_hours = WorkingHours.objects.filter(
            organization=organization,
            staff=staff,
            weekday=booking_date.weekday(),
            is_available=True,
        ).first()

        # CANCELLED bookings free the slot, matching BookingSerializer's
        # `.exclude(status=Booking.Status.CANCELLED)`.
        busy_bookings = Booking.objects.filter(
            organization=organization,
            staff=staff,
            booking_date=booking_date,
        ).exclude(status=Booking.Status.CANCELLED)

        slots = compute_slots(
            working_hours=working_hours,
            duration_minutes=service.duration_minutes,
            booking_date=booking_date,
            busy_bookings=busy_bookings,
            now=timezone.localtime(),
        )

        return Response(
            {
                "service": service.id,
                "staff": staff.id,
                "date": booking_date.isoformat(),
                "duration_minutes": service.duration_minutes,
                "working_hours": (
                    PublicWorkingHoursSerializer(working_hours).data
                    if working_hours
                    else None
                ),
                # Times are emitted as "HH:MM:SS" strings, matching every other
                # time field in this API and the format the frontend's
                # timeToMinutes() parses. Returning raw datetime.time objects
                # would leave response.data and the JSON body disagreeing.
                "slots": [
                    {
                        "start": slot["start"].isoformat(),
                        "end": slot["end"].isoformat(),
                        "available": slot["available"],
                        "reason": slot["reason"],
                    }
                    for slot in slots
                ],
            }
        )

    @staticmethod
    def _int_param(request, name):
        """Return the integer query param, or -1 so the lookup 404s cleanly."""
        try:
            return int(request.query_params.get(name))
        except (TypeError, ValueError):
            return -1
