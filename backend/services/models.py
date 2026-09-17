from django.db import models
from organizations.models import Organization


class ServiceCategory(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="service_categories"
    )# on_delete=models.CASCADE means that if the organization is deleted, all associated service categories will also be deleted. related_name="service_categories" allows you to access the service categories of an organization using organization.service_categories.

    name = models.CharField(max_length=100)

    description = models.TextField(blank=True) #its like optional if the owner wants to add a description

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_category_per_organization"
            )
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"


class Service(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="services"
    )# on_delete=models.CASCADE means that if the organization is deleted, all associated services will also be deleted. related_name="services" allows you to access the services of an organization using organization.services.

    category = models.ForeignKey(
        ServiceCategory,
        on_delete=models.PROTECT,# using protect caaz it doesnt allow deletion of category 
        related_name="services"
    )

    name = models.CharField(max_length=150)

    description = models.TextField(blank=True)

    duration_minutes = models.PositiveIntegerField()# stores sercives time duration like how much time what service needs to tbe done 

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )#pricing for the service 

    is_active = models.BooleanField(default=True)#so the service is active to be used 

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_service_per_organization"
            )
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"