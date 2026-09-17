from django.db import models
from organizations.models import Organization


class Customer(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="customers"
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