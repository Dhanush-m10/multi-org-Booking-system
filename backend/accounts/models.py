from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization


class OrganizationMembership(models.Model):

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        STAFF = "STAFF", "Staff"
        # Self-registered customer of the organization. Deliberately excluded
        # from IsOrganizationAdmin and IsOrganizationStaff, both of which filter
        # on an explicit role list, so it grants no management access.
        CUSTOMER = "CUSTOMER", "Customer"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="organization_memberships"
    )

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships"
    )

    role = models.CharField(
        max_length=10,
        choices=Role.choices
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(  #unique constraint ensures that a user can only have one membership per organization
                fields=["user", "organization"],
                name="unique_user_organization"
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.organization.name} ({self.role})"