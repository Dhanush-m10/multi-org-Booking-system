"""Tests for the public, unauthenticated customer-facing organization API.

Covers: what a visitor may see, that inactive records are never offered, that
nothing private is exposed, that a slug can never surface another
organization's data, and that availability slots are real.
"""

from unittest import mock

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from .views import (
    PublicAvailabilitySlotsView,
    PublicOrganizationDetailView,
    PublicServiceListView,
    PublicStaffListView,
    PublicWorkingHoursListView,
)

from bookings.models import Booking
from fixtures import (
    create_category,
    create_customer_account,
    create_organization,
    create_service,
    create_staff_member,
    future_date_for_weekday,
    set_working_hours,
)


class PublicOrganizationTests(APITestCase):
    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.org_b = create_organization("Beta Salon")

    def test_detail_returns_public_profile(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slug"], "acme-clinic")
        self.assertEqual(response.data["name"], "Acme Clinic")
        self.assertEqual(response.data["phone"], "0000000000")
        self.assertEqual(response.data["address"], "1 Test Street")

    def test_detail_exposes_no_internal_identifiers(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/")

        # The slug is the public handle; the primary key must not leak.
        self.assertNotIn("id", response.data)
        self.assertNotIn("created_at", response.data)

    def test_detail_is_reachable_without_authentication(self):
        # DEFAULT_PERMISSION_CLASSES is IsAuthenticated, so this view must opt in
        # explicitly. A 401 here would mean the portal shows nothing to visitors.
        self.assertFalse(self.client.credentials())
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/")
        self.assertEqual(response.status_code, 200)

    def test_unknown_slug_returns_404(self):
        response = self.client.get("/api/public/organizations/no-such-org/")
        self.assertEqual(response.status_code, 404)


class PublicServiceTests(APITestCase):
    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.org_b = create_organization("Beta Salon")

        self.category = create_category(self.org_a)
        self.active = create_service(self.org_a, self.category, "Consultation")
        self.inactive = create_service(
            self.org_a, self.category, "Retired service", is_active=False
        )

        self.other_category = create_category(self.org_b)
        self.other_service = create_service(
            self.org_b, self.other_category, "Beta service"
        )

    def get_services(self, organization):
        return self.client.get(f"/api/public/organizations/{organization.slug}/services/")

    def test_lists_only_active_services(self):
        response = self.get_services(self.org_a)

        self.assertEqual(response.status_code, 200)
        names = [service["name"] for service in response.data]
        self.assertIn("Consultation", names)
        self.assertNotIn("Retired service", names)

    def test_never_lists_another_organizations_services(self):
        response = self.get_services(self.org_a)

        names = [service["name"] for service in response.data]
        self.assertNotIn("Beta service", names)

    def test_service_payload_has_no_organization_field(self):
        response = self.get_services(self.org_a)

        for service in response.data:
            self.assertNotIn("organization", service)
            # Bookable data a customer needs:
            for field in ("id", "name", "duration_minutes", "price"):
                self.assertIn(field, service)


class PublicStaffTests(APITestCase):
    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.org_b = create_organization("Beta Salon")

        self.category = create_category(self.org_a)
        self.service = create_service(self.org_a, self.category, "Consultation")

        self.active_staff = create_staff_member(
            self.org_a, "Dana Roy", services=[self.service]
        )
        self.inactive_staff = create_staff_member(
            self.org_a, "Retired Person", services=[self.service], is_active=False
        )
        self.other_staff = create_staff_member(self.org_b, "Other Org Person")

    def test_lists_only_active_staff(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/staff/")

        self.assertEqual(response.status_code, 200)
        names = [member["name"] for member in response.data]
        self.assertIn("Dana Roy", names)
        self.assertNotIn("Retired Person", names)

    def test_never_lists_another_organizations_staff(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/staff/")

        names = [member["name"] for member in response.data]
        self.assertNotIn("Other Org Person", names)

    def test_staff_contact_details_are_not_exposed(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/staff/")

        for member in response.data:
            self.assertNotIn("email", member)
            self.assertNotIn("phone", member)
            self.assertNotIn("organization", member)

    def test_staff_payload_declares_which_services_they_perform(self):
        response = self.client.get(f"/api/public/organizations/{self.org_a.slug}/staff/")

        dana = next(m for m in response.data if m["name"] == "Dana Roy")
        self.assertEqual(dana["service_ids"], [self.service.id])


class PublicAvailabilityTests(APITestCase):
    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.category = create_category(self.org_a)
        self.service = create_service(self.org_a, self.category, "Consultation")

        self.available_staff = create_staff_member(
            self.org_a, "Dana Roy", services=[self.service]
        )
        self.unavailable_staff = create_staff_member(
            self.org_a, "Off Person", services=[self.service]
        )

        set_working_hours(self.org_a, self.available_staff, 0, "09:00", "17:00")
        set_working_hours(
            self.org_a, self.unavailable_staff, 0, "09:00", "17:00", is_available=False
        )

    def test_lists_only_available_hours(self):
        response = self.client.get(
            f"/api/public/organizations/{self.org_a.slug}/availability/"
        )

        self.assertEqual(response.status_code, 200)
        staff_ids = {row["staff"] for row in response.data}
        self.assertEqual(staff_ids, {self.available_staff.id})


class PublicSlotsTests(APITestCase):
    """The slot endpoint must offer real availability and no fake slots."""

    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.org_b = create_organization("Beta Salon")

        self.category = create_category(self.org_a)
        # A 30 minute service, matching the acceptance example.
        self.service = create_service(
            self.org_a, self.category, "Consultation", duration_minutes=30
        )
        self.staff = create_staff_member(
            self.org_a, "Dana Roy", services=[self.service]
        )
        # Monday 09:00-17:00.
        self.date = future_date_for_weekday(0)
        set_working_hours(self.org_a, self.staff, 0, "09:00", "17:00")

        self.other_staff = create_staff_member(self.org_b, "Other Person")

    def slots_url(self, organization, service, staff, date):
        return (
            f"/api/public/organizations/{organization.slug}/availability/slots/"
            f"?service={service}&staff={staff}&date={date}"
        )

    def starts(self, response):
        return [slot["start"] for slot in response.data["slots"] if slot["available"]]

    def test_booked_slot_is_not_offered(self):
        # The acceptance case: 30 minute service, 09:00-17:00, 10:00-10:30 taken.
        Booking.objects.create(
            organization=self.org_a,
            customer=create_customer_account(self.org_a, "Jane Cooper", "jane")[1],
            service=self.service,
            staff=self.staff,
            booking_date=self.date,
            start_time="10:00",
            end_time="10:30",
            status=Booking.Status.PENDING,
        )

        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.staff.id, self.date)
        )

        self.assertEqual(response.status_code, 200)
        available = self.starts(response)

        self.assertNotIn("10:00:00", available)
        # A slot that merely touches the booking is fine, matching the overlap
        # rule `start < booking.end_time AND end > booking.start_time`.
        self.assertIn("09:30:00", available)
        self.assertIn("10:30:00", available)

        # The taken slot is still reported, as unavailable, so the UI can show
        # why rather than silently omitting it.
        taken = next(s for s in response.data["slots"] if s["start"] == "10:00:00")
        self.assertFalse(taken["available"])
        self.assertEqual(taken["reason"], "booked")

    def test_cancelled_booking_frees_the_slot(self):
        Booking.objects.create(
            organization=self.org_a,
            customer=create_customer_account(self.org_a, "Jane Cooper", "jane")[1],
            service=self.service,
            staff=self.staff,
            booking_date=self.date,
            start_time="10:00",
            end_time="10:30",
            status=Booking.Status.CANCELLED,
        )

        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.staff.id, self.date)
        )

        self.assertIn("10:00:00", self.starts(response))

    def test_last_slot_respects_the_service_duration(self):
        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.staff.id, self.date)
        )

        # 16:30 + 30min = 17:00, exactly the end of the working day.
        self.assertEqual(response.data["slots"][-1]["start"], "16:30:00")
        self.assertEqual(response.data["slots"][-1]["end"], "17:00:00")

    def test_no_working_hours_that_day_yields_no_slots(self):
        tuesday = future_date_for_weekday(1)

        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.staff.id, tuesday)
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slots"], [])
        self.assertIsNone(response.data["working_hours"])

    def test_past_date_is_rejected(self):
        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.staff.id, "2020-01-06")
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("date", response.data)

    def test_missing_date_is_rejected(self):
        response = self.client.get(
            f"/api/public/organizations/{self.org_a.slug}/availability/slots/"
            f"?service={self.service.id}&staff={self.staff.id}"
        )

        self.assertEqual(response.status_code, 400)

    def test_cannot_read_another_organizations_staff_availability(self):
        # A real staff id, but requested through the wrong organization's slug.
        response = self.client.get(
            self.slots_url(self.org_a, self.service.id, self.other_staff.id, self.date)
        )

        self.assertEqual(response.status_code, 404)

    def test_cannot_read_another_organizations_service(self):
        response = self.client.get(
            self.slots_url(self.org_a, self.service.id + 9999, self.staff.id, self.date)
        )

        self.assertEqual(response.status_code, 404)

    def test_non_integer_params_return_404_rather_than_500(self):
        response = self.client.get(
            f"/api/public/organizations/{self.org_a.slug}/availability/slots/"
            "?service=abc&staff=xyz&date=2030-01-07"
        )

        self.assertEqual(response.status_code, 404)


class PublicThrottlingTests(APITestCase):
    """
    The public endpoints are the only unauthenticated ones, so they are the only
    ones rate limited.

    The suite runs with throttle rates disabled (`TESTING` in settings), so the
    functional test below applies a real rate through `override_settings` and
    clears the throttle cache either side.
    """

    def setUp(self):
        self.org = create_organization("Acme Clinic")
        self.url = f"/api/public/organizations/{self.org.slug}/"
        cache.clear()

    def tearDown(self):
        cache.clear()

    @staticmethod
    def with_rates(rate):
        """
        Apply a real rate for the duration of a block.

        `override_settings(REST_FRAMEWORK=...)` is NOT enough: DRF copies
        `DEFAULT_THROTTLE_RATES` onto `SimpleRateThrottle.THROTTLE_RATES` when
        the class is defined, so the throttle keeps reading the original dict.
        Patching that attribute is what actually changes the limit.
        """
        return mock.patch.object(
            ScopedRateThrottle,
            "THROTTLE_RATES",
            {"public_organization": rate, "public_availability": rate},
        )

    def test_every_public_view_declares_a_throttle_scope(self):
        for view in (
            PublicOrganizationDetailView,
            PublicServiceListView,
            PublicStaffListView,
            PublicWorkingHoursListView,
            PublicAvailabilitySlotsView,
        ):
            with self.subTest(view=view.__name__):
                self.assertIn(ScopedRateThrottle, view.throttle_classes)
                self.assertTrue(view.throttle_scope)

    def test_every_declared_scope_has_a_configured_rate(self):
        # A scope with no entry in DEFAULT_THROTTLE_RATES makes DRF raise
        # ImproperlyConfigured on the first request, so this is a real guard.
        configured = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]

        for view in (PublicOrganizationDetailView, PublicAvailabilitySlotsView):
            self.assertIn(view.throttle_scope, configured)

    def test_the_slots_endpoint_uses_a_tighter_scope(self):
        self.assertEqual(
            PublicOrganizationDetailView.throttle_scope, "public_organization"
        )
        self.assertEqual(
            PublicAvailabilitySlotsView.throttle_scope, "public_availability"
        )

    def test_exceeding_the_rate_returns_429(self):
        with self.with_rates("3/min"):
            codes = [self.client.get(self.url).status_code for _ in range(5)]

        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3], 429)
        self.assertEqual(codes[4], 429)

    def test_management_endpoints_are_not_scoped(self):
        # Authenticated organization traffic is identified by token, not IP, and
        # legitimately arrives in bursts, so it must not inherit these limits.
        from bookings.customer_views import CustomerBookingListCreateView
        from bookings.views import BookingListCreateView

        for view in (BookingListCreateView, CustomerBookingListCreateView):
            with self.subTest(view=view.__name__):
                self.assertNotIn(ScopedRateThrottle, getattr(view, "throttle_classes", []))
