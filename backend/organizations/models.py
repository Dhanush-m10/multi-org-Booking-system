from django.db import models
from django.utils.text import slugify


class Organization(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    address = models.TextField()

    # Public identifier used in customer-facing URLs such as /book/<slug>.
    # A slug is used rather than the database id so that internal primary keys
    # are not exposed in public URLs, and so a link stays stable.
    slug = models.SlugField(max_length=100, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Callers (including the existing RegisterSerializer, which predates the
        # slug field) are not required to supply one. Derive it from the name and
        # keep it unique by appending a numeric suffix on collision.
        if not self.slug:
            self.slug = self._generate_unique_slug()
        super().save(*args, **kwargs)

    def _generate_unique_slug(self):
        base = slugify(self.name)[:100] or "organization"
        candidate = base
        suffix = 2

        while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
            # Leave room for the "-<suffix>" within max_length.
            candidate = f"{base[: 100 - len(str(suffix)) - 1]}-{suffix}"
            suffix += 1

        return candidate

    def __str__(self):
        return self.name
