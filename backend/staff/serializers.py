from rest_framework import serializers

from .models import Staff


class StaffSerializer(serializers.ModelSerializer):

    class Meta:
        model = Staff

        fields = [
            "id",
            "organization",
            "name",
            "email",
            "phone",
            "specialization",
            "services",
            "is_active",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "organization",
            "created_at",
        ]

    def validate_services(self, services):
        organization = self.context["organization"]

        invalid_services = [
            service
            for service in services
            if service.organization_id != organization.id
        ]

        if invalid_services:
            raise serializers.ValidationError(
                "All services must belong to your organization."
            )

        return services