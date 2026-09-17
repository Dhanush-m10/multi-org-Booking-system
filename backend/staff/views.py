from rest_framework import generics

from accounts.utils import get_current_organization

from .models import Staff
from .serializers import StaffSerializer
from accounts.permissions import IsOrganizationAdmin


class StaffListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOrganizationAdmin]

    serializer_class = StaffSerializer

    def get_queryset(self):
        organization = get_current_organization(self.request)

        return (
            Staff.objects
            .filter(organization=organization)
            .prefetch_related("services")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()

        context["organization"] = get_current_organization(
            self.request
        )

        return context

    def perform_create(self, serializer):
        organization = get_current_organization(self.request)

        serializer.save(
            organization=organization
        )