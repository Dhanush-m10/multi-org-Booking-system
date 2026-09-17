from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from organizations.models import Organization

from .models import OrganizationMembership

class RegisterSerializer(serializers.Serializer):

    username = serializers.CharField(max_length=150)

    email = serializers.EmailField()

    password = serializers.CharField(
        write_only=True,
        min_length=8
    )

    organization_name = serializers.CharField(
        max_length=200
    )

    organization_email = serializers.EmailField()

    organization_phone = serializers.CharField(
        max_length=20
    )

    organization_address = serializers.CharField()

    def validate_username(self, username):

        if User.objects.filter(
            username=username
        ).exists():

            raise serializers.ValidationError(
                "Username already exists."
            )

        return username

    def validate_email(self, email):

        if User.objects.filter(
            email=email
        ).exists():

            raise serializers.ValidationError(
                "Email already exists."
            )

        return email

    def validate_organization_email(self, email):
        if Organization.objects.filter(email=email).exists():
            raise serializers.ValidationError(
                "Organization email already exists."
            )

        return email

    @transaction.atomic
    def create(self, validated_data):

        # ---------------------------------------
        # Extract organization information
        # ---------------------------------------

        organization_name = validated_data.pop(
            "organization_name"
        )

        organization_email = validated_data.pop(
            "organization_email"
        )

        organization_phone = validated_data.pop(
            "organization_phone"
        )

        organization_address = validated_data.pop(
            "organization_address"
        )

        password = validated_data.pop(
            "password"
        )

        # ---------------------------------------
        # Create user
        # ---------------------------------------

        user = User.objects.create_user(
            password=password,
            **validated_data
        )

        # ---------------------------------------
        # Create organization
        # ---------------------------------------

        organization = Organization.objects.create(
            name=organization_name,
            email=organization_email,
            phone=organization_phone,
            address=organization_address,
        )

        # ---------------------------------------
        # Make user organization admin
        # ---------------------------------------

        OrganizationMembership.objects.create(
            user=user,
            organization=organization,
            role=OrganizationMembership.Role.ADMIN,
        )

        return user

    def to_representation(self, instance):
        return {
            "id": instance.id,
            "username": instance.username,
            "email": instance.email,
        }