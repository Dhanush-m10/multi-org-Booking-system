from django.urls import path

from .views import (
    ServiceCategoryListCreateView,
    ServiceListCreateView,
)


urlpatterns = [
    path(
        "categories/",
        ServiceCategoryListCreateView.as_view(),
        name="category-list-create",
    ),

    path(
        "services/",
        ServiceListCreateView.as_view(),
        name="service-list-create",
    ),
]