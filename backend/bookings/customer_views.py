"""Customer-facing booking endpoints.

Kept in a separate module from `views.py` so the existing staff/admin booking
API — and its `IsOrganizationStaff` permission — is untouched.

The security model here is that identity is never an input. `organization` and
`customer` are both derived from the authenticated user by
`accounts.utils.get_customer_context`, so a customer cannot book for another
customer or into another organization no matter what the request body contains.
Both fields are read-only in `CustomerBookingSerializer` as well, so a submitted
value is discarded by DRF before it ever reaches the view.

There is deliberately no update path. Cancellation goes through the explicit
`cancel` operation below, which only moves an eligible booking to CANCELLED —
there is no `PATCH` a customer could use to change staff, organization, service
or status.
"""

from rest_framework import generics, status
from rest_framework.response import Response

from accounts.permissions import IsOrganizationCustomer
from accounts.utils import get_customer_context

from .models import Booking
from .serializers import CustomerBookingSerializer

# Statuses a customer may not cancel: the appointment already happened, or was
# already cancelled.
NON_CANCELLABLE_STATUSES = (
    Booking.Status.CANCELLED,
    Booking.Status.COMPLETED,
    Booking.Status.NO_SHOW,
)


class CustomerBookingQuerysetMixin:
    """
    Scopes every lookup to the authenticated customer's own bookings.

    Because the detail and cancel views resolve their object through this
    queryset, another customer's booking is not found here and DRF returns 404 —
    the same response as a booking that does not exist, which does not leak
    whether the id is real.
    """

    permission_classes = [IsOrganizationCustomer]
    serializer_class = CustomerBookingSerializer

    def customer_context(self):
        if not hasattr(self, "_customer_context"):
            self._customer_context = get_customer_context(self.request)
        return self._customer_context

    def get_queryset(self):
        organization, customer = self.customer_context()

        return (
            Booking.objects
            .filter(organization=organization, customer=customer)
            .select_related("service", "staff", "customer")
            .order_by("-booking_date", "-start_time", "-id")
        )


class CustomerBookingListCreateView(
    CustomerBookingQuerysetMixin, generics.ListCreateAPIView
):
    """
    GET  /api/customer/bookings/   the caller's own bookings, and nothing else
    POST /api/customer/bookings/   create a booking for the caller

    Filtering happens here, in the queryset. It is never left to the client.
    """

    def get_serializer_context(self):
        context = super().get_serializer_context()
        organization, customer = self.customer_context()
        context["organization"] = organization
        context["customer"] = customer
        return context

    def perform_create(self, serializer):
        organization, customer = self.customer_context()

        # Both identity fields come from the session, and status is pinned to
        # PENDING rather than taken from the request.
        serializer.save(
            organization=organization,
            customer=customer,
            status=Booking.Status.PENDING,
        )


class CustomerBookingDetailView(
    CustomerBookingQuerysetMixin, generics.RetrieveAPIView
):
    """GET /api/customer/bookings/<id>/ — 404 unless it is the caller's."""


class CustomerBookingCancelView(CustomerBookingQuerysetMixin, generics.GenericAPIView):
    """
    POST /api/customer/bookings/<id>/cancel/

    Cancels one of the caller's own bookings. Returns 404 if the booking belongs
    to someone else, and 400 if its status makes cancellation meaningless.
    """

    def post(self, request, *args, **kwargs):
        booking = self.get_object()

        if booking.status in NON_CANCELLABLE_STATUSES:
            return Response(
                {
                    "status": [
                        f"A {booking.get_status_display().lower()} booking "
                        "cannot be cancelled."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status", "updated_at"])

        return Response(self.get_serializer(booking).data)
