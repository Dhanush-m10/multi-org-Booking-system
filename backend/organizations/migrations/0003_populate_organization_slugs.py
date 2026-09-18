# Backfills slugs for organizations created before the slug field existed,
# mirroring Organization._generate_unique_slug() so the result matches what the
# model would have produced.

from django.db import migrations
from django.utils.text import slugify


def populate_slugs(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")

    taken = set(
        Organization.objects.exclude(slug__isnull=True).values_list("slug", flat=True)
    )

    for organization in Organization.objects.filter(slug__isnull=True).order_by("pk"):
        base = slugify(organization.name)[:100] or "organization"
        candidate = base
        suffix = 2

        while candidate in taken:
            candidate = f"{base[: 100 - len(str(suffix)) - 1]}-{suffix}"
            suffix += 1

        taken.add(candidate)
        organization.slug = candidate
        organization.save(update_fields=["slug"])


def reverse_noop(apps, schema_editor):
    # Slugs are derived data; dropping them is handled by reversing 0002.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0002_organization_slug'),
    ]

    operations = [
        migrations.RunPython(populate_slugs, reverse_noop),
    ]
