from django.urls import path

from .views import WorkingHoursListCreateView


urlpatterns = [
    path(
        "working-hours/",
        WorkingHoursListCreateView.as_view(),
        name="working-hours-list-create",
    ),
]