from django.db import models
from organizations.models import Organization
from staff.models import Staff


class WorkingHours(models.Model):

    class WeekDay(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="working_hours"
    )

    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name="working_hours"
    )

    weekday = models.IntegerField(
        choices=WeekDay.choices
    )

    start_time = models.TimeField()

    end_time = models.TimeField()

    is_available = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["staff", "weekday"],
                name="unique_staff_working_day"
            )
        ]

    def __str__(self):
        return (
            f"{self.staff.name} - "
            f"{self.get_weekday_display()} "
            f"{self.start_time} - {self.end_time}"
        )