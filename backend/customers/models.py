from django.contrib.auth.models import User
from django.db import models

from organizations.models import Organization


class Customer(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="customers"
    )

    # Optional link to the Django User that owns this customer record.
    #
    # OneToOneField, not ForeignKey, on purpose: it makes it impossible for one
    # user account to be ambiguously linked to several customer records, which
    # would make "my bookings" undefined.
    #
    # Null because customer records created by organization staff through the
    # management portal have no login attached. Only self-registered customers
    # get one.
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="customer_profile",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "email"],
                name="unique_customer_email_per_organization"
            )
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"
