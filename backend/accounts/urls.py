from django.urls import path

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    CurrentUserView,
    CustomerRegisterView,
    RegisterView,
)


urlpatterns = [

    path(
        "register/",
        RegisterView.as_view(),
        name="register",
    ),

    path(
        "customer/register/",
        CustomerRegisterView.as_view(),
        name="customer-register",
    ),

    # Customers are ordinary Django users, so they authenticate through this
    # same endpoint — no separate customer login is needed.
    path(
        "login/",
        TokenObtainPairView.as_view(),
        name="login",
    ),

    path(
        "refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),

    path(
        "me/",
        CurrentUserView.as_view(),
        name="current-user",
    ),
]
