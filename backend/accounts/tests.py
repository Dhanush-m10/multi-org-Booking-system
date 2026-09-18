"""Tests for customer authentication and the permission matrix.

The most important property under test: adding the CUSTOMER role must not grant
access to any management endpoint, and must not change what ADMIN or STAFF can
do.
"""

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from accounts.models import OrganizationMembership
from customers.models import Customer
from fixtures import (
    PASSWORD,
    create_admin_account,
    create_category,
    create_customer_account,
    create_organization,
    create_service,
    create_staff_account,
    create_staff_member,
)

# Every management endpoint in the system.
MANAGEMENT_ENDPOINTS = [
    "/api/services/",
    "/api/categories/",
    "/api/staff/",
    "/api/working-hours/",
    "/api/customers/",
    "/api/bookings/",
]


class CustomerRegisterTests(APITestCase):
    def setUp(self):
        self.org = create_organization("Acme Clinic")

    def register(self, **overrides):
        payload = {
            "organization_slug": self.org.slug,
            "name": "Jane Cooper",
            "email": "jane@example.test",
            "phone": "0000000000",
            "password": PASSWORD,
        }
        payload.update(overrides)
        return self.client.post("/api/auth/customer/register/", payload)

    def test_creates_user_customer_and_customer_membership(self):
        response = self.register()

        self.assertEqual(response.status_code, 201)

        user = User.objects.get(username="jane@example.test")
        customer = Customer.objects.get(user=user)

        self.assertEqual(customer.organization_id, self.org.id)
        self.assertEqual(customer.name, "Jane Cooper")

        membership = OrganizationMembership.objects.get(user=user)
        self.assertEqual(membership.role, OrganizationMembership.Role.CUSTOMER)
        self.assertEqual(membership.organization_id, self.org.id)

    def test_password_is_hashed_not_stored(self):
        self.register()
        user = User.objects.get(username="jane@example.test")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))

    def test_unknown_organization_slug_is_rejected(self):
        response = self.register(organization_slug="no-such-org")

        self.assertEqual(response.status_code, 400)
        self.assertIn("organization_slug", response.data)
        self.assertFalse(User.objects.filter(username="jane@example.test").exists())

    def test_email_already_used_by_a_user_is_rejected(self):
        create_admin_account(self.org, "jane@example.test")

        response = self.register()

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_email_already_a_customer_of_that_organization_is_rejected(self):
        # Refusing (rather than attaching a login) means a registrant cannot
        # claim an existing customer's booking history.
        Customer.objects.create(
            organization=self.org, name="Existing Jane", email="jane@example.test"
        )

        response = self.register()

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertFalse(User.objects.filter(username="jane@example.test").exists())

    def test_email_held_as_another_users_username_is_rejected(self):
        # The email is reused as the username, so a collision there must be a
        # clean 400 rather than a unique-constraint 500.
        User.objects.create_user(
            username="jane@example.test", email="someone-else@example.test"
        )

        response = self.register()

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertEqual(
            User.objects.filter(username="jane@example.test").count(), 1
        )

    def test_short_password_is_rejected(self):
        response = self.register(password="short")

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_role_cannot_be_escalated_through_the_payload(self):
        # There is no role field, so a supplied one is ignored and the account is
        # still a customer.
        response = self.register(role="ADMIN")

        self.assertEqual(response.status_code, 201)
        membership = OrganizationMembership.objects.get(
            user__username="jane@example.test"
        )
        self.assertEqual(membership.role, OrganizationMembership.Role.CUSTOMER)

    def test_organization_id_in_the_payload_does_not_select_the_organization(self):
        other = create_organization("Beta Salon")

        response = self.register(organization=other.id, organization_id=other.id)

        self.assertEqual(response.status_code, 201)
        customer = Customer.objects.get(user__username="jane@example.test")
        self.assertEqual(customer.organization_id, self.org.id)

    def test_phone_is_optional(self):
        response = self.client.post(
            "/api/auth/customer/register/",
            {
                "organization_slug": self.org.slug,
                "name": "No Phone",
                "email": "nop@example.test",
                "password": PASSWORD,
            },
        )

        self.assertEqual(response.status_code, 201)


class CustomerLoginTests(APITestCase):
    def setUp(self):
        self.org = create_organization("Acme Clinic")
        self.user, self.customer = create_customer_account(
            self.org, "Jane Cooper", "jane@example.test"
        )

    def test_customer_logs_in_through_the_existing_jwt_endpoint(self):
        # Customers are ordinary Django users, so no separate login exists.
        response = self.client.post(
            "/api/auth/login/",
            {"username": "jane@example.test", "password": PASSWORD},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_me_reports_the_customer_role_and_organization(self):
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "CUSTOMER")
        self.assertEqual(response.data["organization"]["slug"], self.org.slug)
        self.assertEqual(response.data["customer_id"], self.customer.id)

    def test_me_never_lists_other_members(self):
        create_admin_account(self.org, "admin@example.test")
        create_staff_account(self.org, "staff@example.test")
        self.client.force_authenticate(self.user)

        response = self.client.get("/api/auth/me/")

        self.assertEqual(
            set(response.data.keys()),
            {
                "id",
                "username",
                "email",
                "first_name",
                "last_name",
                "organization",
                "role",
                "customer_id",
            },
        )

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)


class RoleMatrixTests(APITestCase):
    """A CUSTOMER must reach no management endpoint; ADMIN/STAFF must be unchanged."""

    def setUp(self):
        self.org = create_organization("Acme Clinic")

        self.admin = create_admin_account(self.org, "admin@example.test")
        self.staff = create_staff_account(self.org, "staff@example.test")
        self.customer_user, self.customer = create_customer_account(
            self.org, "Jane Cooper", "jane@example.test"
        )

        self.category = create_category(self.org)
        self.service = create_service(self.org, self.category, "Consultation")
        self.staff_member = create_staff_member(
            self.org, "Dana Roy", services=[self.service]
        )

    def test_customer_is_forbidden_from_every_management_endpoint(self):
        self.client.force_authenticate(self.customer_user)

        for url in MANAGEMENT_ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_customer_cannot_create_management_records(self):
        self.client.force_authenticate(self.customer_user)

        response = self.client.post(
            "/api/customers/", {"name": "Sneaky", "email": "sneaky@example.test"}
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Customer.objects.filter(email="sneaky@example.test").exists())

    def test_admin_still_reaches_admin_only_endpoints(self):
        # Guards against the CUSTOMER role being added by loosening an existing
        # permission class instead of adding a new one.
        self.client.force_authenticate(self.admin)

        for url in MANAGEMENT_ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_staff_permissions_are_unchanged(self):
        self.client.force_authenticate(self.staff)

        expected = {
            "/api/services/": 403,
            "/api/categories/": 403,
            "/api/staff/": 403,
            "/api/working-hours/": 403,
            "/api/customers/": 200,
            "/api/bookings/": 200,
        }

        for url, code in expected.items():
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, code)

    def test_customer_role_reports_correctly_for_admin_and_staff(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/auth/me/").data["role"], "ADMIN")

        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get("/api/auth/me/").data["role"], "STAFF")

        self.client.force_authenticate(self.customer_user)
        self.assertEqual(self.client.get("/api/auth/me/").data["role"], "CUSTOMER")

    def test_public_endpoints_need_no_token(self):
        self.client.force_authenticate(None)

        self.assertEqual(
            self.client.get(f"/api/public/organizations/{self.org.slug}/").status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                f"/api/public/organizations/{self.org.slug}/services/"
            ).status_code,
            200,
        )
