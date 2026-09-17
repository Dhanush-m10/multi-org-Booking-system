from rest_framework.exceptions import PermissionDenied

from .models import OrganizationMembership


def get_current_organization(request):
    """
    Return the organization associated with the authenticated user.
    """

    if not request.user or not request.user.is_authenticated:
        raise PermissionDenied("Authentication is required.")

    membership = (
        OrganizationMembership.objects
        .select_related("organization")
        .filter(user=request.user)
        .first()
    )

    if not membership:
        raise PermissionDenied(
            "You are not associated with any organization."
        )

    return membership.organization