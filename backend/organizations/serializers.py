"""Serializers for the public, unauthenticated customer-facing organization API.

These are deliberately plain `Serializer` classes rather than `ModelSerializer`
subclasses: an explicit field list means a new column added to a model can never
be exposed here by accident.

What is intentionally NOT exposed:
  - Organization.id / primary keys of the organization (the slug is the public
    identifier), memberships, users, or any credential material
  - the customer list, or any customer record other than the requester's own
  - staff email/phone — a customer needs to know who will treat them and what
    they specialise in, not how to contact them directly
"""

from rest_framework import serializers


class PublicOrganizationSerializer(serializers.Serializer):
    slug = serializers.SlugField(read_only=True)
    name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    phone = serializers.CharField(read_only=True)
    address = serializers.CharField(read_only=True)


class PublicCategorySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)


class PublicServiceSerializer(serializers.Serializer):
    """A bookable service. `id` is exposed because booking requires it; the
    booking endpoint re-validates that it belongs to the organization."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)
    price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    category = PublicCategorySerializer(read_only=True)


class PublicStaffSerializer(serializers.Serializer):
    """Who can perform which service. No contact details."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    specialization = serializers.CharField(read_only=True)
    service_ids = serializers.SerializerMethodField()

    def get_service_ids(self, obj):
        return sorted(obj.services.values_list("id", flat=True))


class PublicWorkingHoursSerializer(serializers.Serializer):
    staff = serializers.IntegerField(source="staff_id", read_only=True)
    weekday = serializers.IntegerField(read_only=True)
    start_time = serializers.TimeField(read_only=True)
    end_time = serializers.TimeField(read_only=True)
