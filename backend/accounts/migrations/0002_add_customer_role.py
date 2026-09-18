# Adds the CUSTOMER role to OrganizationMembership.
#
# This is a choices-only change: no schema change, no data change. Existing
# ADMIN and STAFF rows are untouched.
#
# CUSTOMER is excluded from IsOrganizationAdmin and IsOrganizationStaff, both of
# which filter on an explicit role list, so this grants no management access.
#
# No `AlterField(id=...)`: see organizations/migrations/0002 for why.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organizationmembership',
            name='role',
            field=models.CharField(
                choices=[
                    ('ADMIN', 'Admin'),
                    ('STAFF', 'Staff'),
                    ('CUSTOMER', 'Customer'),
                ],
                max_length=10,
            ),
        ),
    ]
