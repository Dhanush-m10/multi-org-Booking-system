from rest_framework import generics

from accounts.utils import get_current_organization

from .models import WorkingHours
from .serializers import WorkingHoursSerializer
from accounts.permissions import IsOrganizationAdmin

class WorkingHoursListCreateView(generics.ListCreateAPIView):

    serializer_class = WorkingHoursSerializer
    permission_classes = [IsOrganizationAdmin]

    def get_queryset(self):
        organization = get_current_organization(self.request)

        return (
            WorkingHours.objects
            .filter(organization=organization)
            .select_related("staff")
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