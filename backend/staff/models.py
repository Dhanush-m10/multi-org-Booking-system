from django.db import models
from organizations.models import Organization
from services.models import Service


class Staff(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staff_members"
    )#every staff member belongs to an organization

    name = models.CharField(max_length=150)

    email = models.EmailField(blank=True)

    phone = models.CharField(max_length=20, blank=True)

    specialization = models.CharField(
        max_length=150,
        blank=True
    )

    services = models.ManyToManyField(
        Service,
        related_name="staff_members",
        blank=True
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "email"],
                name="unique_staff_email_per_organization"
            )
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"