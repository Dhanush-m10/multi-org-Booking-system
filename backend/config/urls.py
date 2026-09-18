from django.contrib import admin
from django.urls import include, path


urlpatterns = [

    path("admin/", admin.site.urls),

    path(
        "api/",
        include("organizations.urls")
    ),

    path(
        "api/",
        include("services.urls")
    ),

    path(
        "api/",
        include("staff.urls")
    ),

    path(
        "api/",
        include("availability.urls")
    ),

    path(
        "api/",
        include("customers.urls")
    ),

    path(
    "api/",
    include("bookings.urls")
    ),

    path(
    "api/auth/",
    include("accounts.urls")
    ),
]