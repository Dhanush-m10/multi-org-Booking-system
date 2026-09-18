"""Shared fixtures for the customer-portal test suite.

Named `fixtures.py` rather than `tests_*.py` so Django's test discovery
(`test*.py`) does not treat it as a test module.
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone

from accounts.models import OrganizationMembership
from availability.models import WorkingHours
from customers.models import Customer
from organizations.models import Organization
from services.models import Service, ServiceCategory
from staff.models import Staff

PASSWORD = "StrongPass123!"


def create_organization(name):
    """Organization with an auto-generated slug, mirroring production behaviour."""
    return Organization.objects.create(
        name=name,
        email=f"{name.lower().replace(' ', '-')}@example.test",
        phone="0000000000",
        address="1 Test Street",
    )


def create_user(username, email=None):
    # A username that already looks like an email is used as-is, so fixtures that
    # pass an email address as the username produce a matching email rather than
    # "name@example.test@example.test".
    return User.objects.create_user(
        username=username,
        email=email or (username if "@" in username else f"{username}@example.test"),
        password=PASSWORD,
    )


def add_membership(user, organization, role):
    return OrganizationMembership.objects.create(
        user=user, organization=organization, role=role
    )


def create_admin_account(organization, username):
    user = create_user(username)
    add_membership(user, organization, OrganizationMembership.Role.ADMIN)
    return user


def create_staff_account(organization, username):
    user = create_user(username)
    add_membership(user, organization, OrganizationMembership.Role.STAFF)
    return user


def create_customer_account(organization, name, username):
    """User + Customer profile + CUSTOMER membership — the self-registration shape."""
    user = create_user(username)
    customer = Customer.objects.create(
        organization=organization,
        user=user,
        name=name,
        email=user.email,
        phone="0000000000",
    )
    add_membership(user, organization, OrganizationMembership.Role.CUSTOMER)
    return user, customer


def create_customer_record(organization, name, username):
    """A staff-created customer record with no login attached."""
    return Customer.objects.create(
        organization=organization,
        name=name,
        email=f"{username}@example.test",
        phone="0000000000",
    )


def create_category(organization, name="General"):
    return ServiceCategory.objects.create(organization=organization, name=name)


def create_service(organization, category, name, duration_minutes=30, price="40.00",
                   is_active=True):
    return Service.objects.create(
        organization=organization,
        category=category,
        name=name,
        description="",
        duration_minutes=duration_minutes,
        price=price,
        is_active=is_active,
    )


def create_staff_member(organization, name, services=(), is_active=True):
    staff = Staff.objects.create(
        organization=organization,
        name=name,
        email=f"{name.lower().replace(' ', '.')}@example.test",
        phone="0000000000",
        specialization="Testing",
        is_active=is_active,
    )
    if services:
        staff.services.set(list(services))
    return staff


def set_working_hours(organization, staff, weekday, start="09:00", end="17:00",
                      is_available=True):
    return WorkingHours.objects.create(
        organization=organization,
        staff=staff,
        weekday=weekday,
        start_time=start,
        end_time=end,
        is_available=is_available,
    )


def future_date_for_weekday(weekday, weeks_ahead=2):
    """A date safely in the future that falls on the given weekday (Mon=0)."""
    today = timezone.localdate()
    delta = (weekday - today.weekday()) % 7
    return today + timedelta(days=delta + 7 * weeks_ahead)
