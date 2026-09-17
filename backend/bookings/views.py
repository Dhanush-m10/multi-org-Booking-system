from rest_framework import generics

from accounts.utils import get_current_organization

from .models import Booking
from .serializers import BookingSerializer
from accounts.permissions import IsOrganizationStaff

class BookingListCreateView(generics.ListCreateAPIView):

    serializer_class = BookingSerializer
    permission_classes = [IsOrganizationStaff]

    def get_queryset(self):
        organization = get_current_organization(self.request)

        return (
            Booking.objects
            .filter(organization=organization)
            .select_related(
                "customer",
                "service",
                "staff",
            )
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


class BookingDetailView(generics.RetrieveUpdateAPIView):

    serializer_class = BookingSerializer
    permission_classes = [IsOrganizationStaff]

    def get_queryset(self):
        organization = get_current_organization(self.request)

        return Booking.objects.filter(
            organization=organization
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()

        context["organization"] = get_current_organization(
            self.request
        )

        return context