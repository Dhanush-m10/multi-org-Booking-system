from rest_framework import serializers

from .models import WorkingHours


class WorkingHoursSerializer(serializers.ModelSerializer):

    class Meta:
        model = WorkingHours

        fields = [
            "id",
            "organization",
            "staff",
            "weekday",
            "start_time",
            "end_time",
            "is_available",
        ]

        read_only_fields = [
            "id",
            "organization",
        ]

    def validate(self, data):

        organization = self.context["organization"]

        staff = data.get("staff")

        if staff.organization_id != organization.id:
            raise serializers.ValidationError(
                "Staff member does not belong to your organization."
            )

        if data["start_time"] >= data["end_time"]:
            raise serializers.ValidationError(
                "Start time must be before end time."
            )

        return data