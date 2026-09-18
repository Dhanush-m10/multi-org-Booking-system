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


def get_customer_context(request):
    """
    Return `(organization, customer)` for an authenticated CUSTOMER.

    Both values are derived server-side from the authenticated user:
      - the organization comes from the CUSTOMER OrganizationMembership;
      - the customer record comes from the user's own `customer_profile`.

    Neither is ever read from the request payload, so a customer cannot submit
    an arbitrary organization id or book on behalf of another customer.

    The customer record's organization is re-checked against the membership's
    organization as defense in depth: if they ever disagreed, the data would be
    inconsistent and the request is refused rather than guessed at.
    """

    if not request.user or not request.user.is_authenticated:
        raise PermissionDenied("Authentication is required.")

    membership = (
        OrganizationMembership.objects
        .select_related("organization")
        .filter(
            user=request.user,
            role=OrganizationMembership.Role.CUSTOMER,
        )
        .first()
    )

    if not membership:
        raise PermissionDenied("A customer account is required.")

    customer = getattr(request.user, "customer_profile", None)

    if customer is None:
        raise PermissionDenied("No customer profile is linked to this account.")

    if customer.organization_id != membership.organization_id:
        raise PermissionDenied(
            "Customer profile does not match the account organization."
        )

    return membership.organization, customer