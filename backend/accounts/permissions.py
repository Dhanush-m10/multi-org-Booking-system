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