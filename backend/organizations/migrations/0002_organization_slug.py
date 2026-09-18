# Adds a public slug to Organization.
#
# Added in three stages (nullable -> backfilled -> required) so this works on a
# database that already contains organizations. A single migration adding a
# required unique column would fail there.
#
# Note: no `AlterField(id=...)` here. makemigrations under Django 5.x emits one
# because DEFAULT_AUTO_FIELD is unset and 5.x defaults to AutoField while 6.x
# defaults to BigAutoField. Including it would downgrade primary keys on a
# Django 6 deployment, which is not an intended part of this change.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='slug',
            field=models.SlugField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
