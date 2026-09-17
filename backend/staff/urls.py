from django.urls import path

from .views import StaffListCreateView


urlpatterns = [
    path(
        "staff/",
        StaffListCreateView.as_view(),
        name="staff-list-create",
    ),
]