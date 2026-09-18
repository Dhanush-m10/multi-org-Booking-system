from django.urls import path

from .customer_views import (
    CustomerBookingCancelView,
    CustomerBookingDetailView,
    CustomerBookingListCreateView,
)
from .views import (
    BookingListCreateView,
    BookingDetailView,
)


urlpatterns = [

    # ---- organization staff / admin (unchanged) -----------------------------
    # These require IsOrganizationStaff. A CUSTOMER membership does not satisfy
    # it, so the routes below are the only booking API a customer can reach.

    path(
        "bookings/",
        BookingListCreateView.as_view(),
        name="booking-list-create",
    ),

    path(
        "bookings/<int:pk>/",
        BookingDetailView.as_view(),
        name="booking-detail",
    ),

    # ---- customer self-service ----------------------------------------------
    # Requires IsOrganizationCustomer, and is scoped to the caller's own
    # bookings in the view's queryset.

    path(
        "customer/bookings/",
        CustomerBookingListCreateView.as_view(),
        name="customer-booking-list-create",
    ),

    path(
        "customer/bookings/<int:pk>/",
        CustomerBookingDetailView.as_view(),
        name="customer-booking-detail",
    ),

    path(
        "customer/bookings/<int:pk>/cancel/",
        CustomerBookingCancelView.as_view(),
        name="customer-booking-cancel",
    ),
]
