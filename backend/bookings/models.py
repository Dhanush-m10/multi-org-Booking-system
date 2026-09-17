from django.db import models
from organizations.models import Organization
from customers.models import Customer
from services.models import Service
from staff.models import Staff


class Booking(models.Model):

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"
        NO_SHOW = "NO_SHOW", "No Show"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="bookings"
    )

    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="bookings"
    )

    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="bookings"
    )

    staff = models.ForeignKey(
        Staff,
        on_delete=models.PROTECT,
        related_name="bookings"
    )

    booking_date = models.DateField()

    start_time = models.TimeField()

    end_time = models.TimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return (
            f"{self.customer.name} - "
            f"{self.service.name} - "
            f"{self.booking_date} "
            f"{self.start_time}"
        )