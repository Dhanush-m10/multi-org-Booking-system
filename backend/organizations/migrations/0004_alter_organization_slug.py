# Makes the slug required, now that 0003 has backfilled every existing row.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0003_populate_organization_slugs'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organization',
            name='slug',
            field=models.SlugField(max_length=100, unique=True),
        ),
    ]
