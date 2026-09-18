from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    CurrentUserSerializer,
    CustomerRegisterSerializer,
    RegisterSerializer,
)


class RegisterView(generics.CreateAPIView):

    serializer_class = RegisterSerializer

    permission_classes = []


class CustomerRegisterView(generics.CreateAPIView):
    """
    POST /api/auth/customer/register/

    Creates a customer account for an existing organization. Anonymous, like
    RegisterView, but the role is always CUSTOMER and no organization is created.

    Login is the existing /api/auth/login/ — customers are ordinary Django users,
    so no second token endpoint is needed.
    """

    serializer_class = CustomerRegisterSerializer

    permission_classes = []


class CurrentUserView(APIView):
    """
    GET /api/auth/me/

    The caller's own id, role and organization. Requires only authentication, so
    it works for admins, staff and customers alike. It exposes nothing about
    other members of the organization.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)
