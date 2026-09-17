from rest_framework import generics

from accounts.utils import get_current_organization

from .models import Customer
from .serializers import CustomerSerializer
from accounts.permissions import IsOrganizationStaff

class CustomerListCreateView(generics.ListCreateAPIView):

    serializer_class = CustomerSerializer
    permission_classes = [IsOrganizationStaff]

    def get_queryset(self):
        organization = get_current_organization(self.request)

        return Customer.objects.filter(
            organization=organization
        )

    def perform_create(self, serializer):
        organization = get_current_organization(self.request)

        serializer.save(
            organization=organization
        )