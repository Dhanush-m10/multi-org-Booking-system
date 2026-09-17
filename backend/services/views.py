from rest_framework import generics

from accounts.utils import get_current_organization
from accounts.permissions import IsOrganizationAdmin

from .models import ServiceCategory, Service
from .serializers import (
    ServiceCategorySerializer,
    ServiceSerializer,
)


class ServiceCategoryListCreateView(
    generics.ListCreateAPIView
):

    serializer_class = ServiceCategorySerializer
    permission_classes = [IsOrganizationAdmin]

    def get_queryset(self):
        organization = get_current_organization(
            self.request
        )

        return ServiceCategory.objects.filter(
            organization=organization
        )

    def perform_create(self, serializer):
        organization = get_current_organization(
            self.request
        )

        serializer.save(
            organization=organization
        )


class ServiceListCreateView(
    generics.ListCreateAPIView
):

    serializer_class = ServiceSerializer
    permission_classes = [IsOrganizationAdmin]

    def get_queryset(self):
        organization = get_current_organization(
            self.request
        )

        return Service.objects.filter(
            organization=organization
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()

        context["organization"] = (
            get_current_organization(self.request)
        )

        return context

    def perform_create(self, serializer):
        organization = get_current_organization(
            self.request
        )

        serializer.save(
            organization=organization
        )