"""Django settings for the multi-organization booking backend.

Configuration is read from the process environment, optionally seeded from a
`.env` file next to `manage.py`. Nothing secret is committed: `.env` is
gitignored, `.env.example` documents the keys, and every value below has a
development-only default so `python manage.py runserver` works with no setup.
"""

import os
import sys
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Environment helpers
# ---------------------------------------------------------------------------


def _load_dotenv(path):
    """
    Read `KEY=VALUE` lines from a .env file into `os.environ`.

    A hand-rolled loader rather than a `python-dotenv` dependency, to keep the
    dependency list unchanged. Existing environment variables always win, so a
    real deployment's environment takes precedence over any file.
    """

    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_str_or(name, default):
    raw = os.environ.get(name)
    return raw if raw else default


def env_list(name, default=()):
    raw = os.environ.get(name)
    if raw is None:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# True while `manage.py test` is running. Used below to switch request throttling
# off, so the test suite is not rate-limited by its own requests.
TESTING = "test" in sys.argv


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    # Development fallback only. Refused below when DEBUG is off.
    "django-insecure-i!g%_)6cot0ji*%3wnist0=e-dmxv7rfb)4sdpc-d)4ubqx*!=",
)

DEBUG = env_bool("DJANGO_DEBUG", True)

# Local development must keep working with no configuration. Production supplies
# the real hosts through DJANGO_ALLOWED_HOSTS (comma separated).
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

if not DEBUG and SECRET_KEY.startswith("django-insecure-"):
    # Fail loudly rather than serve production traffic with a key that is
    # published in this repository.
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a secret value when DJANGO_DEBUG is off."
    )

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',  # Add the corsheaders app
    'bookings',  # Add the bookings app
    'customers',  # Add the customers app required by bookings
    'availability',  # Add the availability app
    'staff',  # Add the staff app required by availability
    'services',  # Add the services app
    'accounts',  # Add the accounts app
    'organizations',  # Add the organizations app
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Add the CORS middleware
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------------------------
# Primary keys
# ---------------------------------------------------------------------------

# Pinned explicitly. Every existing migration declares BigAutoField primary
# keys, which is also Django 6's default — but Django 5 defaults to AutoField.
# Without this line, running `makemigrations` under Django 5 offers to emit
# `AlterField(id=AutoField)` migrations that would DOWNGRADE the existing
# primary keys. Pinning it keeps migration output identical across Django
# releases and silences the models.W042 warnings.
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def _database_from_url(url):
    """
    Turn a DATABASE_URL into a Django DATABASES entry.

    Supports `postgres://` / `postgresql://` (the intended production database)
    and `sqlite://`. A tiny parser rather than a `dj-database-url` dependency,
    again to keep the dependency list unchanged.
    """

    parsed = urlparse(url)
    scheme = parsed.scheme.lower()

    if scheme in {"postgres", "postgresql"}:
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (parsed.path or "/").lstrip("/") or "booking",
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "localhost",
            "PORT": str(parsed.port or ""),
        }

    if scheme == "sqlite":
        name = (parsed.path or "").lstrip("/")
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / name if name else BASE_DIR / "db.sqlite3",
        }

    raise ImproperlyConfigured(
        f"Unsupported DATABASE_URL scheme '{scheme}'. Use postgres:// or sqlite://."
    )


DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
else:
    # Default: local SQLite, zero configuration.
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------

# Only origins that must call this API cross-origin belong here. Local
# development needs none of it in practice, because the Angular dev server
# proxies /api server-to-server; the entry is kept so a browser pointed
# straight at Django still works.
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    ["http://localhost:4200", "http://127.0.0.1:4200"],
)

# The API authenticates with Bearer tokens, not cookies, so CORS credentials are
# deliberately left off. Enabling them would widen the surface for no benefit.
CORS_ALLOW_CREDENTIALS = False

# Relevant to the Django admin over HTTPS in production.
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

# Request throttling reads from this cache. LocMemCache is per-process, which is
# fine for a single-server deployment; a multi-worker production deployment needs
# a shared cache (e.g. Redis) or the limits will apply per worker rather than
# globally. See README -> Production considerations.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "booking-api",
    }
}

# ---------------------------------------------------------------------------
# REST framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],

    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],

    # Throttling is opt-in per view, so authenticated management traffic is
    # never rate-limited by these settings. The public, unauthenticated
    # organization endpoints set `throttle_scope` themselves.
    #
    # Rates are disabled while the test suite runs (`TESTING`) so the tests are
    # not throttled by their own requests; a `None` rate means unlimited.
    "DEFAULT_THROTTLE_RATES": {
        "public_organization": None if TESTING else env_str_or(
            "THROTTLE_PUBLIC_ORGANIZATION", "120/min"
        ),
        "public_availability": None if TESTING else env_str_or(
            "THROTTLE_PUBLIC_AVAILABILITY", "60/min"
        ),
    },
}



# ---------------------------------------------------------------------------
# Simple JWT
# ---------------------------------------------------------------------------

# Defaults are SimpleJWT's own (5 minute access, 1 day refresh), so exposing
# these does not silently change how long an existing session lasts. Raise the
# access lifetime in production only if the frontend's refresh flow is taken into
# account — the Angular interceptor already refreshes transparently on 401.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_TOKEN_MINUTES", "5"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_DAYS", "1"))
    ),
}
