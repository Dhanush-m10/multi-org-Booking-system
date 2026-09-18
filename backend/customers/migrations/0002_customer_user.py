# Links a Customer to the Django User that owns it, for self-registered
# customers. OneToOne so one account can never map to several customer records.
# Nullable because staff-created customer records have no login.
#
# No `AlterField(id=...)`: see organizations/migrations/0002 for why.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('customers', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='user',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='customer_profile',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
