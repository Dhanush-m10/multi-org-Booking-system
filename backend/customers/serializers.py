from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):

    class Meta:
        model = Customer

        fields = [
            "id",
            "organization",
            "name",
            "email",
            "phone",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "organization",
            "created_at",
        ]