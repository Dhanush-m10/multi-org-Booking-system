"""Tests for the customer-facing booking endpoints.

The central requirement is organization isolation, so most of this module is two
organizations, each with its own customer, staff, services and bookings, trying
every cross-access path:

  - seeing another customer's bookings
  - seeing another organization's bookings
  - booking another customer's appointment (submitting their customer id)
  - booking into another organization (submitting its id, its service, its staff)
  - reading or cancelling a booking that is not theirs

Every one of those must be refused by the backend. None of them is prevented in
the frontend.
"""

from rest_framework.test import APITestCase

from accounts.models import OrganizationMembership
from bookings.models import Booking
from fixtures import (
    create_admin_account,
    create_category,
    create_customer_account,
    create_organization,
    create_service,
    create_staff_account,
    create_staff_member,
    future_date_for_weekday,
    set_working_hours,
)

BOOKINGS_URL = "/api/customer/bookings/"


class CustomerPortalTestBase(APITestCase):
    """Two fully independent organizations."""

    def setUp(self):
        self.org_a = create_organization("Acme Clinic")
        self.org_b = create_organization("Beta Salon")

        # --- organization A -------------------------------------------------
        self.category_a = create_category(self.org_a, "Acme category")
        self.service_a = create_service(
            self.org_a, self.category_a, "Consultation", duration_minutes=30
        )
        self.staff_a = create_staff_member(
            self.org_a, "Dana Roy", services=[self.service_a]
        )
        self.date_a = future_date_for_weekday(0)
        set_working_hours(self.org_a, self.staff_a, 0, "09:00", "17:00")

        self.customer_a_user, self.customer_a = create_customer_account(
            self.org_a, "Jane Cooper", "jane@example.test"
        )
        self.other_customer_a = create_customer_account(
            self.org_a, "Other Person", "other@example.test"
        )[1]

        # --- organization B -------------------------------------------------
        self.category_b = create_category(self.org_b, "Beta category")
        self.service_b = create_service(
            self.org_b, self.category_b, "Beta service", duration_minutes=30
        )
        self.staff_b = create_staff_member(
            self.org_b, "Ben Lee", services=[self.service_b]
        )
        self.date_b = future_date_for_weekday(0)
        set_working_hours(self.org_b, self.staff_b, 0, "09:00", "17:00")

        self.customer_b_user, self.customer_b = create_customer_account(
            self.org_b, "Sam Smith", "sam@example.test"
        )

    def as_customer(self, user):
        self.client.force_authenticate(user)

    def booking_payload(self, **overrides):
        payload = {
            "service": self.service_a.id,
            "staff": self.staff_a.id,
            "booking_date": self.date_a.isoformat(),
            "start_time": "10:00:00",
            "notes": "",
        }
        payload.update(overrides)
        return payload

    def make_booking(self, customer, **overrides):
        defaults = dict(
            organization=customer.organization,
            customer=customer,
            service=self.service_a if customer.organization_id == self.org_a.id
            else self.service_b,
            staff=self.staff_a if customer.organization_id == self.org_a.id
            else self.staff_b,
            booking_date=self.date_a if customer.organization_id == self.org_a.id
            else self.date_b,
            start_time="11:00",
            end_time="11:30",
            status=Booking.Status.PENDING,
        )
        defaults.update(overrides)
        return Booking.objects.create(**defaults)


class CustomerBookingCreateTests(CustomerPortalTestBase):
    def test_customer_can_create_their_own_booking(self):
        self.as_customer(self.customer_a_user)

        response = self.client.post(BOOKINGS_URL, self.booking_payload())

        self.assertEqual(response.status_code, 201)

        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.customer_id, self.customer_a.id)
        self.assertEqual(booking.organization_id, self.org_a.id)

    def test_organization_and_customer_are_derived_not_accepted(self):
        self.as_customer(self.customer_a_user)

        response = self.client.post(
            BOOKINGS_URL,
            self.booking_payload(
                customer=self.customer_b.id, organization=self.org_b.id
            ),
        )

        self.assertEqual(response.status_code, 201)

        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.customer_id, self.customer_a.id)
        self.assertEqual(booking.organization_id, self.org_a.id)

    def test_end_time_is_derived_from_the_service_duration(self):
        self.as_customer(self.customer_a_user)

        response = self.client.post(BOOKINGS_URL, self.booking_payload())

        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data["end_time"]), "10:30:00")

    def test_status_is_always_pending_regardless_of_the_payload(self):
        self.as_customer(self.customer_a_user)

        response = self.client.post(
            BOOKINGS_URL, self.booking_payload(status="COMPLETED")
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "PENDING")

    def test_anonymous_cannot_book(self):
        response = self.client.post(BOOKINGS_URL, self.booking_payload())
        self.assertEqual(response.status_code, 401)

    def test_staff_and_admin_cannot_use_the_customer_endpoint(self):
        # IsOrganizationCustomer admits only the CUSTOMER role, so a staff member
        # cannot reach customer self-service through it either.
        for user in (
            create_staff_account(self.org_a, "staff@example.test"),
            create_admin_account(self.org_a, "admin@example.test"),
        ):
            with self.subTest(user=user.username):
                self.as_customer(user)
                self.assertEqual(
                    self.client.post(BOOKINGS_URL, self.booking_payload()).status_code,
                    403,
                )


class CustomerBookingRuleTests(CustomerPortalTestBase):
    """The customer path enforces the same 12 rules as the staff path."""

    def post_as_customer_a(self, **overrides):
        self.as_customer(self.customer_a_user)
        return self.client.post(BOOKINGS_URL, self.booking_payload(**overrides))

    def test_service_of_another_organization_is_rejected(self):
        response = self.post_as_customer_a(service=self.service_b.id)

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Service does not belong to your organization.",
            str(response.data["non_field_errors"]),
        )

    def test_staff_of_another_organization_is_rejected(self):
        # The staff member is real, just not this organization's.
        self.staff_b.services.add(self.service_a)
        response = self.post_as_customer_a(staff=self.staff_b.id)

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Staff member does not belong to your organization.",
            str(response.data["non_field_errors"]),
        )

    def test_staff_who_does_not_perform_the_service_is_rejected(self):
        other_service = create_service(self.org_a, self.category_a, "Massage")
        response = self.post_as_customer_a(service=other_service.id)

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "This staff member does not provide this service.",
            str(response.data["non_field_errors"]),
        )

    def test_past_date_is_rejected(self):
        response = self.post_as_customer_a(booking_date="2020-01-06")

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Booking date cannot be in the past.", str(response.data["non_field_errors"])
        )

    def test_day_the_staff_does_not_work_is_rejected(self):
        tuesday = future_date_for_weekday(1)
        response = self.post_as_customer_a(booking_date=tuesday.isoformat())

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Staff member is not available on this day.",
            str(response.data["non_field_errors"]),
        )

    def test_time_outside_working_hours_is_rejected(self):
        response = self.post_as_customer_a(start_time="08:00:00")

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Booking time is outside the staff member's working hours.",
            str(response.data["non_field_errors"]),
        )

    def test_slot_that_runs_past_closing_is_rejected(self):
        response = self.post_as_customer_a(start_time="16:45:00")

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Booking time is outside the staff member's working hours.",
            str(response.data["non_field_errors"]),
        )

    def test_overlapping_booking_is_rejected(self):
        self.make_booking(self.customer_a, start_time="10:00", end_time="10:30")

        response = self.post_as_customer_a()

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Staff member already has a booking during this time.",
            str(response.data["non_field_errors"]),
        )

    def test_cancelled_booking_does_not_block_the_slot(self):
        self.make_booking(
            self.customer_a,
            start_time="10:00",
            end_time="10:30",
            status=Booking.Status.CANCELLED,
        )

        response = self.post_as_customer_a()

        self.assertEqual(response.status_code, 201)

    def test_touching_booking_is_allowed(self):
        self.make_booking(self.customer_a, start_time="10:30", end_time="11:00")

        response = self.post_as_customer_a()  # 10:00-10:30

        self.assertEqual(response.status_code, 201)


class CustomerBookingVisibilityTests(CustomerPortalTestBase):
    def test_customer_sees_only_their_own_bookings(self):
        self.make_booking(self.customer_a)
        self.make_booking(self.other_customer_a)
        self.make_booking(self.customer_b)

        self.as_customer(self.customer_a_user)
        response = self.client.get(BOOKINGS_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["customer"], self.customer_a.id)

    def test_customer_never_sees_another_organizations_bookings(self):
        self.make_booking(self.customer_b)

        self.as_customer(self.customer_a_user)
        response = self.client.get(BOOKINGS_URL)

        self.assertEqual(response.data, [])

    def test_two_customers_of_the_same_organization_are_isolated(self):
        self.make_booking(self.customer_a)
        self.make_booking(self.other_customer_a, start_time="12:00", end_time="12:30")

        self.as_customer(self.other_customer_a.user)
        response = self.client.get(BOOKINGS_URL)

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["customer"], self.other_customer_a.id)

    def test_reading_another_customers_booking_returns_404(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.other_customer_a.user)
        response = self.client.get(f"{BOOKINGS_URL}{booking.id}/")

        self.assertEqual(response.status_code, 404)

    def test_reading_another_organizations_booking_returns_404(self):
        booking = self.make_booking(self.customer_b)

        self.as_customer(self.customer_a_user)
        response = self.client.get(f"{BOOKINGS_URL}{booking.id}/")

        self.assertEqual(response.status_code, 404)

    def test_customer_can_read_their_own_booking(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.customer_a_user)
        response = self.client.get(f"{BOOKINGS_URL}{booking.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], booking.id)

    def test_staff_cannot_use_the_customer_list_endpoint(self):
        staff = create_staff_account(self.org_a, "staff@example.test")
        self.make_booking(self.customer_a)

        self.as_customer(staff)
        self.assertEqual(self.client.get(BOOKINGS_URL).status_code, 403)


class CustomerBookingUpdateTests(CustomerPortalTestBase):
    """There is no general update path; cancellation is a dedicated operation."""

    def test_patch_is_not_allowed(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.customer_a_user)
        response = self.client.patch(
            f"{BOOKINGS_URL}{booking.id}/", {"status": "COMPLETED"}
        )

        self.assertEqual(response.status_code, 405)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.PENDING)

    def test_put_is_not_allowed(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.customer_a_user)
        response = self.client.put(f"{BOOKINGS_URL}{booking.id}/", self.booking_payload())

        self.assertEqual(response.status_code, 405)

    def test_delete_is_not_allowed(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.customer_a_user)
        response = self.client.delete(f"{BOOKINGS_URL}{booking.id}/")

        self.assertEqual(response.status_code, 405)
        self.assertTrue(Booking.objects.filter(pk=booking.id).exists())

    def test_customer_cannot_create_through_the_staff_endpoint(self):
        self.as_customer(self.customer_a_user)

        response = self.client.post(
            "/api/bookings/",
            {
                "customer": self.customer_a.id,
                "service": self.service_a.id,
                "staff": self.staff_a.id,
                "booking_date": self.date_a.isoformat(),
                "start_time": "10:00:00",
            },
        )

        self.assertEqual(response.status_code, 403)


class CustomerBookingCancelTests(CustomerPortalTestBase):
    def test_customer_can_cancel_their_own_pending_booking(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 200)

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.CANCELLED)

    def test_confirmed_booking_can_be_cancelled(self):
        booking = self.make_booking(
            self.customer_a, status=Booking.Status.CONFIRMED
        )

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 200)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.CANCELLED)

    def test_cancelling_another_customers_booking_returns_404(self):
        booking = self.make_booking(self.customer_a)

        self.as_customer(self.other_customer_a.user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 404)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.PENDING)

    def test_cancelling_another_organizations_booking_returns_404(self):
        booking = self.make_booking(self.customer_b)

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 404)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.PENDING)

    def test_completed_booking_cannot_be_cancelled(self):
        booking = self.make_booking(self.customer_a, status=Booking.Status.COMPLETED)

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 400)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.COMPLETED)

    def test_no_show_booking_cannot_be_cancelled(self):
        booking = self.make_booking(self.customer_a, status=Booking.Status.NO_SHOW)

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 400)

    def test_cancelling_twice_is_rejected(self):
        booking = self.make_booking(
            self.customer_a, status=Booking.Status.CANCELLED
        )

        self.as_customer(self.customer_a_user)
        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")

        self.assertEqual(response.status_code, 400)

    def test_cancel_requires_authentication(self):
        booking = self.make_booking(self.customer_a)

        response = self.client.post(f"{BOOKINGS_URL}{booking.id}/cancel/")
        self.assertEqual(response.status_code, 401)


class CustomerContextIntegrityTests(CustomerPortalTestBase):
    """Guards the server-side derivation itself, not just the HTTP surface."""

    def test_customer_with_no_profile_is_refused(self):
        # A CUSTOMER membership but no linked Customer record: the context cannot
        # be resolved, so the request is refused rather than guessed at.
        from django.contrib.auth.models import User

        user = User.objects.create_user(
            username="orphan@example.test",
            email="orphan@example.test",
            password="StrongPass123!",
        )
        OrganizationMembership.objects.create(
            user=user,
            organization=self.org_a,
            role=OrganizationMembership.Role.CUSTOMER,
        )

        self.as_customer(user)
        self.assertEqual(self.client.get(BOOKINGS_URL).status_code, 403)

    def test_cancelled_booking_reopens_the_slot_for_the_same_customer(self):
        self.as_customer(self.customer_a_user)

        first = self.client.post(BOOKINGS_URL, self.booking_payload())
        self.assertEqual(first.status_code, 201)

        self.assertEqual(
            self.client.post(BOOKINGS_URL, self.booking_payload()).status_code, 400
        )

        self.client.post(f"{BOOKINGS_URL}{first.data['id']}/cancel/")

        retry = self.client.post(BOOKINGS_URL, self.booking_payload())
        self.assertEqual(retry.status_code, 201)
