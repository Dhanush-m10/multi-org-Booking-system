from rest_framework.permissions import BasePermission

from .models import OrganizationMembership


class IsOrganizationMember(BasePermission):
    """
    Allows access only to authenticated users
    who belong to an organization.
    """

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user
        ).exists()


class IsOrganizationAdmin(BasePermission):
    """
    Allows access only to organization admins.
    """

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            role=OrganizationMembership.Role.ADMIN,
        ).exists()


class IsOrganizationStaff(BasePermission):
    """
    Allows access to users who are organization
    admins or staff.

    CUSTOMER is deliberately not in this list: a customer must never reach a
    management endpoint. Adding a role here is what would weaken isolation, so
    this list is explicit rather than "anything that is not a customer".
    """

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=[
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.STAFF,
            ],
        ).exists()


class IsOrganizationCustomer(BasePermission):
    """
    Allows access only to users whose membership role is CUSTOMER.

    This is a separate permission rather than a loosened IsOrganizationStaff so
    that the two audiences can never be confused, and so no customer-facing view
    has to remember to exclude staff.
    """

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            role=OrganizationMembership.Role.CUSTOMER,
        ).exists()