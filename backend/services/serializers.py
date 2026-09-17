from rest_framework import serializers

from .models import ServiceCategory, Service


class ServiceCategorySerializer(serializers.ModelSerializer):

    class Meta:
        model = ServiceCategory

        fields = [
            "id",
            "organization",
            "name",
            "description",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "organization",
            "created_at",
        ]


class ServiceSerializer(serializers.ModelSerializer):

    class Meta:
        model = Service

        fields = [
            "id",
            "organization",
            "category",
            "name",
            "description",
            "duration_minutes",
            "price",
            "is_active",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "organization",
            "created_at",
        ]

    def validate_category(self, category):
        """
        Make sure the selected category belongs
        to the current organization.
        """

        organization = self.context["organization"]

        if category.organization_id != organization.id:
            raise serializers.ValidationError(
                "This category does not belong to your organization."
            )

        return category