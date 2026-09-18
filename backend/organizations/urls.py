from django.urls import path

from .views import (
    PublicAvailabilitySlotsView,
    PublicOrganizationDetailView,
    PublicServiceListView,
    PublicStaffListView,
    PublicWorkingHoursListView,
)

# Customer-facing public API. Unauthenticated and read-only; see views.py for
# what is and is not exposed.
urlpatterns = [
    path(
        "public/organizations/<slug:slug>/",
        PublicOrganizationDetailView.as_view(),
        name="public-organization-detail",
    ),
    path(
        "public/organizations/<slug:slug>/services/",
        PublicServiceListView.as_view(),
        name="public-organization-services",
    ),
    path(
        "public/organizations/<slug:slug>/staff/",
        PublicStaffListView.as_view(),
        name="public-organization-staff",
    ),
    path(
        "public/organizations/<slug:slug>/availability/",
        PublicWorkingHoursListView.as_view(),
        name="public-organization-availability",
    ),
    path(
        "public/organizations/<slug:slug>/availability/slots/",
        PublicAvailabilitySlotsView.as_view(),
        name="public-organization-availability-slots",
    ),
]
