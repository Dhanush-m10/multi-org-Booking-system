from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from organizations.models import Organization

from customers.models import Customer

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

class CustomerRegisterSerializer(serializers.Serializer):
    """
    Self-registration for a customer of an existing organization.

    The organization is chosen by its public slug, never by database id, and the
    caller is always created with the CUSTOMER role — there is no field through
    which a role could be requested, so this endpoint cannot mint an admin.

    Customers reuse the ordinary Django User and the existing JWT login at
    /api/auth/login/, so no second authentication system is introduced.
    """

    organization_slug = serializers.SlugField(max_length=100)

    name = serializers.CharField(max_length=150)

    email = serializers.EmailField()

    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, email):
        # The email is also used as the username, so both must be free. Checking
        # only the email would let a pre-existing user holding this address as
        # their username through, and the create below would then fail on the
        # username unique constraint with a 500 instead of a clean 400.
        if User.objects.filter(email=email).exists() or User.objects.filter(
            username=email
        ).exists():
            raise serializers.ValidationError("Email already exists.")
        return email

    def validate(self, data):
        organization = Organization.objects.filter(
            slug=data["organization_slug"]
        ).first()

        if organization is None:
            raise serializers.ValidationError(
                {"organization_slug": ["Unknown organization."]}
            )

        # If the organization already holds a customer record for this email,
        # refuse rather than attach a new login to it. Linking would hand the
        # registrant that customer's existing booking history, and this project
        # performs no email verification, so it cannot prove who controls the
        # address. The organization can link the account deliberately instead.
        # Recorded as a limitation in the README.
        if Customer.objects.filter(
            organization=organization, email=data["email"]
        ).exists():
            raise serializers.ValidationError(
                {
                    "email": [
                        "This email is already registered with the organization. "
                        "Please contact them to access your existing bookings."
                    ]
                }
            )

        data["organization"] = organization
        return data

    @transaction.atomic
    def create(self, validated_data):
        organization = validated_data.pop("organization")
        validated_data.pop("organization_slug")
        password = validated_data.pop("password")

        # `name` and `phone` belong to the Customer record, not to the User, so
        # they must be taken out before the user is created.
        name = validated_data.pop("name")
        phone = validated_data.pop("phone", "")
        email = validated_data["email"]

        # The email is used as the username so the customer can sign in with the
        # address they registered with, through the existing login endpoint.
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
        )

        customer = Customer.objects.create(
            organization=organization,
            user=user,
            name=name,
            email=email,
            phone=phone,
        )

        OrganizationMembership.objects.create(
            user=user,
            organization=organization,
            role=OrganizationMembership.Role.CUSTOMER,
        )

        return user

    def to_representation(self, instance):
        return {
            "id": instance.id,
            "username": instance.username,
            "email": instance.email,
        }


class CurrentOrganizationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.SlugField(read_only=True)


class CurrentUserSerializer(serializers.Serializer):
    """
    The authenticated caller's own identity, role and organization.

    Everything here describes the caller; it never lists other members. It is
    what lets the frontend label a session correctly instead of inferring a
    role, though it is a convenience — every authorization decision is still
    made server-side by the permission classes.
    """

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    organization = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    customer_id = serializers.SerializerMethodField()

    def _membership(self, obj):
        return (
            OrganizationMembership.objects
            .select_related("organization")
            .filter(user=obj)
            .order_by("id")
            .first()
        )

    def get_organization(self, obj):
        membership = self._membership(obj)
        if membership is None:
            return None
        return CurrentOrganizationSerializer(membership.organization).data

    def get_role(self, obj):
        membership = self._membership(obj)
        return membership.role if membership else None

    def get_customer_id(self, obj):
        customer = getattr(obj, "customer_profile", None)
        return customer.id if customer else None
