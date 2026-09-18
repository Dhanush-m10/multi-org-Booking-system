# Multi-Organization Booking System

A multi-tenant appointment booking platform. One deployment hosts many independent
organizations — clinics, salons, studios — each with its own staff, services,
availability and customers. Every organization also gets a public booking page at a
human-readable URL, so a customer can book without an account being created for them
by an administrator first.

Two audiences share one codebase:

- **Organizations** sign up, get an admin account, and manage their own business from
  a management dashboard.
- **Customers** arrive at `/book/<organization-slug>` and complete a booking, then
  create their own login to view and cancel it.

---

## 1. Project overview

The system models a booking business end to end:

| Concept | Meaning |
| --- | --- |
| **Organization** | A tenant. Identified publicly by a unique `slug`. |
| **User** | A login (Django `User`), scoped to one organization through a membership. |
| **Membership** | The join between a user and an organization, carrying the role. |
| **Staff member** | A bookable person inside an organization (not necessarily a login). |
| **Category / Service** | What can be booked, with a duration and a price. |
| **Working hours** | Which weekday/time ranges a specific staff member is available. |
| **Customer** | A person an organization holds a record for. May or may not have a login. |
| **Booking** | A customer + service + staff member + date + start time. `end_time` is derived. |

Two distinct booking paths exist, deliberately:

- **Staff-created bookings** — an administrator or staff member books on a customer's
  behalf from the management dashboard.
- **Self-service bookings** — a customer books themselves from the public page.

Both go through the same serializer and therefore the same business rules.

---

## 2. Architecture

```
                    ┌───────────────────────────────┐
   Browser ───────► │  Angular 21 SPA (Tailwind 4)  │  static files, Vercel
                    └───────────────┬───────────────┘
                                    │  /api  (relative URLs only)
                                    ▼
                    ┌───────────────────────────────┐
                    │  Django 5.2 + DRF REST API    │  cloud host
                    │  JWT (SimpleJWT)              │
                    └───────────────┬───────────────┘
                                    ▼
                            ┌───────────────┐
                            │  PostgreSQL   │  (SQLite locally)
                            └───────────────┘
```

Three hard rules shape the design:

1. **The frontend is never the authorization boundary.** Every request is authorized by
   the backend from the JWT. Angular's role checks decide which links to render, never
   whether an action is permitted.
2. **The organization is never supplied by the client.** It is derived server-side from
   the authenticated user (for management and customer endpoints) or from the URL slug
   (for public endpoints). An `organization` value in a request body is ignored.
3. **Public and private data are separate serializers.** Public endpoints use plain
   `Serializer` classes with an explicit field list, so a new database column cannot
   leak by accident.

---

## 3. Backend stack

| Component | Version | Purpose |
| --- | --- | --- |
| Python | 3.11+ | Runtime (3.11.2 verified) |
| Django | **5.2 LTS** | Web framework |
| Django REST Framework | 3.18 | REST API, serializers, throttling |
| djangorestframework-simplejwt | 5.5 | JWT authentication |
| django-cors-headers | 4.9 | CORS for local development |

Pinned in [`requirements.txt`](requirements.txt).

> **Why Django 5.2 and not 6.1.** `requirements.txt` previously pinned `Django==6.1.1`.
> That version exists on PyPI but requires **Python ≥ 3.12**, so it could not be
> installed or tested on the Python 3.11 used to develop this project:
>
> ```
> ERROR: Ignored the following versions that require a different python version:
>        6.1.1 Requires-Python >=3.12
> ```
>
> The pin is now 5.2 (LTS, supported to April 2028) — the version the test suite
> actually runs against. Upgrading to 6.1 later needs Python 3.12+ and a one-line pin
> change, and **no migration work**: `settings.py` pins `DEFAULT_AUTO_FIELD` to
> `BigAutoField`, which is Django 6's own default, so both versions emit identical
> migration state.

---

## 4. Frontend stack

| Component | Version | Purpose |
| --- | --- | --- |
| Angular | 21 | SPA framework, standalone components |
| TypeScript | 5.9 | Language (`strict`, `strictTemplates`) |
| Tailwind CSS | 4 | The single design system |
| Vitest + jsdom | 4 | Unit tests |
| Angular CLI | 21 | Build, serve, test |

Notable Angular choices:

- **Zoneless change detection** (no `zone.js`) — everything is signal-driven.
- **Standalone components only**; no `NgModule` anywhere.
- **One design system** — Tailwind utility classes. No component-library CSS.
- The public booking flow and the customer area are **lazily loaded**, so a visitor
  booking an appointment never downloads the management dashboard.

---

## 5. Database

Development uses **SQLite** (`backend/db.sqlite3`, gitignored). Production is intended
to be **PostgreSQL**, selected simply by setting `DATABASE_URL`.

All primary keys are `BigAutoField`, declared explicitly in the migrations and matched
by `DEFAULT_AUTO_FIELD` in settings — so no version difference ever produces a
surprising `AlterField` migration.

Schema in brief:

- `organizations_organization.slug` — `varchar(100)`, **UNIQUE**, NOT NULL.
- `accounts_organizationmembership` — unique on `(organization, user)`, with
  `role ∈ {ADMIN, STAFF, CUSTOMER}`.
- `customers_customer` — unique on `(organization, email)`;
  `user` is a **nullable `OneToOneField`** to `User` (`related_name="customer_profile"`,
  `on_delete=CASCADE`), so a customer record can exist before that person ever logs in.
- `bookings_booking` — `end_time` is derived from the service duration and is never
  written by a client.

Migrations are committed and are the only way the schema changes.

---

## 6. Authentication

One auth system for everyone: **JWT via SimpleJWT**. There is no second mechanism for
customers.

| Endpoint | Access | Returns |
| --- | --- | --- |
| `POST /api/auth/register/` | anonymous | `201`, **no tokens** |
| `POST /api/auth/customer/register/` | anonymous | `201`, **no tokens** |
| `POST /api/auth/login/` | anonymous | `{access, refresh}` |
| `POST /api/auth/refresh/` | anonymous | `{access}` |
| `GET /api/auth/me/` | any authenticated user | profile, **role**, organization |

Deliberate details:

- **Registration never returns a token.** A client must log in. This keeps one code
  path for session creation.
- **The JWT payload carries no role or organization.** Role is fetched from
  `/api/auth/me/` and used only to choose navigation. Authorization comes from the
  token's user identity alone, so a hand-edited token cannot escalate anything.
- **Access tokens last 5 minutes** (SimpleJWT's default) and the Angular interceptor
  refreshes transparently on a 401. Both lifetimes are configurable by environment
  variable.
- **Tokens live in `localStorage`** through a single `TokenService` — the only module
  that touches `localStorage`. This is an XSS-exposed storage choice; see
  [§20 Known limitations](#20-known-limitations).

**Role persistence across a refresh:** `TokenService` stores the session user
(including `role` and organization) in `localStorage` and seeds its signal
synchronously at construction, so the correct navigation renders on the first paint
after a reload without waiting on the network.

---

## 7. Roles

| Capability | ADMIN | STAFF | CUSTOMER | Anonymous |
| --- | :-: | :-: | :-: | :-: |
| Read public organization page | ✓ | ✓ | ✓ | ✓ |
| Book for self (`/api/customer/bookings/`) | — | — | ✓ | — |
| Manage own bookings | — | — | ✓ | — |
| Manage customers and bookings | ✓ | ✓ | — | — |
| Manage services, categories, staff, availability | ✓ | — | — | — |
| Reach the management UI | ✓ | ✓ | — | — |

`CUSTOMER` is a membership role, but the management permission classes accept only
`ADMIN`/`STAFF`, so holding `CUSTOMER` grants nothing beyond the customer endpoints.
A customer attempting any management endpoint receives **403**.

Routing:

- `authGuard` sends an authenticated **customer** to `/customer/bookings`, never to
  `/dashboard`.
- The management shell is never rendered for a customer, so no management navigation
  is ever presented to them.
- These are navigation decisions only. The 403s above are what actually protect data.

---

## 8. Multi-organization isolation

Isolation is enforced in the backend permission and queryset layer, not in the UI.

- **Management endpoints** derive the organization from the authenticated user's
  membership and filter every queryset by it. An ADMIN of Organization A cannot read,
  list or patch Organization B's records — attempts return **404**, not 403, so the
  existence of another tenant's record is not disclosed.
- **Customer endpoints** (`IsOrganizationCustomer`) resolve the caller's `Customer`
  record and scope strictly to it. Customer A cannot read or cancel Customer B's
  booking (404), even within the same organization.
- **Public endpoints** accept only a slug in the URL and return that organization's
  published data only.

Verified live, not just in tests (Organization A = `acme-clinic`, Organization B =
`beta-salon`):

| Attempt | Result |
| --- | --- |
| Customer A books using Organization B's service + staff | 400 |
| Customer A submits another customer's id, `organization`, `status` | ignored → own customer, own org, `PENDING` |
| Customer A reads / cancels Customer B's booking | 404 |
| Customer B reads Customer A's booking | 404 |
| ADMIN A reads / patches an Organization B booking | 404 |
| STAFF A lists / reads an Organization B booking | not present / 404 |
| STAFF A reaches staff management at all | 403 |

---

## 9. Admin flow

1. Register at `/register` → an organization and an ADMIN account are created together.
2. Log in → `/dashboard`.
3. Create a **category**, then **services** (name, duration, price, active flag).
4. Create **staff members** and assign which services each provides.
5. Set **working hours** per staff member per weekday.
6. Add **customers**, then create **bookings** on their behalf.
7. Confirm, complete, mark no-show or cancel bookings.

Administrators additionally see the full management navigation.

---

## 10. Staff flow

Staff log in with the same form and land on the same dashboard, but only the features
their role permits are available:

- **Available:** customers, bookings.
- **Refused (403):** services, categories, staff management, working hours.

The Angular navigation reflects this; the backend refuses it independently.

---

## 11. Customer flow

The public flow is a guided wizard, entirely driven by Django data — **no mock data
anywhere**.

```
/book/:organizationSlug              organization landing + service list
  → /services                        pick a service
  → /staff                           only staff who provide that service
  → /date                            date picker, then real available slots
  → /confirmation                    review + book (register or log in)
  → /customer/bookings               view and cancel
```

What the visitor sees at each step:

- **Organization landing** — the organization's published name, address, phone and
  email (click-to-call and mailto links).
- **Services** — cards with description, **duration** and **price**.
- **Staff** — only staff who can actually provide the chosen service.
- **Date** — a date picker, then real time slots computed from working hours and
  existing bookings. Each slot states why it is unavailable when it is. Previously
  chosen slots are marked as selected in both the visual style and the accessibility
  tree.
- **Confirmation** — a summary, and either a login or a short registration form.
- **My bookings** — the customer's own bookings, with cancel.

Loading skeletons, empty states and API error states are handled at every step, and
backend validation errors are surfaced verbatim rather than replaced by generic
frontend messages.

A customer can only cancel a booking. `PATCH`, `PUT` and `DELETE` on their own booking
return **405**; cancelling an already cancelled, completed or no-show booking returns
**400**.

---

## 12. API overview

All routes are under `/api/`. Field names are `snake_case`; dates are `YYYY-MM-DD`;
times are `HH:MM:SS`; weekdays are integers with **Monday = 0**.

### Authentication

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register/` | anonymous |
| POST | `/auth/customer/register/` | anonymous |
| POST | `/auth/login/` | anonymous |
| POST | `/auth/refresh/` | anonymous |
| GET | `/auth/me/` | any authenticated user |

### Public (no authentication)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/public/organizations/<slug>/` | `slug, name, email, phone, address` |
| GET | `/public/organizations/<slug>/services/` | active services only |
| GET | `/public/organizations/<slug>/staff/` | `id, name, specialization, service_ids` |
| GET | `/public/organizations/<slug>/availability/` | `staff, weekday, start_time, end_time` |
| GET | `/public/organizations/<slug>/availability/slots/?service=&staff=&date=` | computed slots |

The slot response is `{service, staff, date, duration_minutes, working_hours, slots}`,
where each slot is `{start, end, available, reason}`. If a staff member has no working
hours that weekday, `slots` is an empty list — slots are never invented.

### Customer

| Method | Path | Access |
| --- | --- | --- |
| GET / POST | `/customer/bookings/` | `IsOrganizationCustomer` |
| GET | `/customer/bookings/<id>/` | `IsOrganizationCustomer` |
| POST | `/customer/bookings/<id>/cancel/` | `IsOrganizationCustomer` |

`organization`, `customer`, `end_time` and `status` are **read-only** on this
serializer, so a customer cannot submit them.

### Management (ADMIN/STAFF as noted)

| Method | Path | Access |
| --- | --- | --- |
| GET / POST | `/services/`, `/categories/` | ADMIN |
| GET / POST | `/staff/`, `/working-hours/` | ADMIN |
| GET / POST | `/customers/` | ADMIN, STAFF |
| GET / POST / GET one / PATCH | `/bookings/` | ADMIN, STAFF |

`DELETE` is not implemented anywhere; collections are list + create.

### Booking rules (enforced server-side)

1. The service must be active and belong to the caller's organization.
2. The staff member must belong to the same organization.
3. The staff member must provide that service.
4. `booking_date` may not be in the past.
5. The slot must fall inside the staff member's working hours for that weekday.
6. The whole `start` → `start + duration` window must fit inside those hours.
7. `end_time` is derived from the service duration; it is never accepted from a client.
8. The slot must not overlap another booking for the same staff member and date.
9. Cancelled bookings do not block a slot; every other status does.
10. `status` starts as `PENDING` and is never client-settable.

---

## 13. Local setup

Prerequisites: **Python 3.11+** and **Node 20+**.

```bash
git clone https://github.com/Dhanush-m10/multi-org-Booking-system.git
cd multi-org-Booking-system

# Backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd backend
cp .env.example .env                # optional; development defaults work as-is
python manage.py migrate
python manage.py runserver          # http://127.0.0.1:8000

# Frontend (new terminal)
cd frontend
npm install
npm start                           # http://localhost:4200
```

The Angular dev server proxies `/api` to `http://127.0.0.1:8000`
(`frontend/proxy.conf.mjs`), so the browser only ever uses relative URLs and no CORS
configuration is needed for local development.

There is no single seed command. [`backend/fixtures.py`](backend/fixtures.py) provides
composable factory helpers instead, so you can create exactly the data a scenario
needs:

```bash
cd backend && python manage.py shell
```

```python
import fixtures as f
org = f.create_organization("Test Clinic")
f.create_admin_account(org, "admin")            # password: f.PASSWORD
cat = f.create_category(org, "General")
svc = f.create_service(org, cat, "Consultation", duration_minutes=30, price="40.00")
person = f.create_staff_member(org, "Dr. Smith", services=[svc])
f.set_working_hours(org, person, 0)             # weekday 0 = Monday, 09:00-17:00
```

Available helpers: `create_organization`, `create_user`, `add_membership`,
`create_admin_account`, `create_staff_account`, `create_customer_account`,
`create_customer_record`, `create_category`, `create_service`, `create_staff_member`,
`set_working_hours`, `future_date_for_weekday`, and the shared `PASSWORD` constant.

---

## 14. Environment variables

Everything is optional — `settings.py` has working development defaults. Copy
[`backend/.env.example`](backend/.env.example) to `backend/.env` to override. Values
already present in the real environment always win over the file, so a container or
PaaS deployment needs no `.env` at all. `.env` is gitignored and is never committed.

| Variable | Default | Notes |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | insecure dev key | **Required in production.** Startup is refused if `DEBUG` is off and the key is still the insecure default. |
| `DJANGO_DEBUG` | `true` | Must be `false` in production. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` | Only needed when the browser calls Django directly. |
| `CSRF_TRUSTED_ORIGINS` | empty | For Django admin over HTTPS. |
| `DATABASE_URL` | local SQLite | `postgres://user:pass@host:5432/db` or `sqlite://…` |
| `THROTTLE_PUBLIC_ORGANIZATION` | `120/min` | Per-IP limit on public reads. |
| `THROTTLE_PUBLIC_AVAILABILITY` | `60/min` | Per-IP limit on slot computation. |
| `JWT_ACCESS_TOKEN_MINUTES` | `5` | SimpleJWT's own default. |
| `JWT_REFRESH_TOKEN_DAYS` | `1` | SimpleJWT's own default. |

No production domain is hard-coded anywhere in the repository.

---

## 15. Running the backend

```bash
cd backend
python manage.py check                    # system checks
python manage.py migrate                  # apply migrations
python manage.py runserver 0.0.0.0:8000   # development
```

For anything beyond development, serve through a real WSGI/ASGI server
(`gunicorn config.wsgi`) behind a reverse proxy. **`runserver` is not for production.**

---

## 16. Running the frontend

```bash
cd frontend
npm start                       # dev server on :4200, proxies /api
npm run watch                   # continuous development build
npm run build                   # production build
```

---

## 17. Testing

```bash
# Backend — 83 tests
cd backend && python manage.py test

# Frontend — 128 tests across 13 files
cd frontend && npx ng test --watch=false
```

The suites cover organization isolation, every booking rule, role permissions,
serializer field exposure, public-endpoint throttling, and the Angular wizard,
guards, interceptors and services.

Throttle rates are disabled automatically while the test suite runs (`TESTING` flag in
`settings.py`), so tests are not order-dependent.

---

## 18. Production build

```bash
cd frontend && npx ng build
```

The build uses the Angular CLI (`ng build`, default configuration **production**) and
emits to `frontend/dist/frontend/browser/`. This is deliberately **not** converted to
Vite, React or any other toolchain.

---

## 19. Deployment architecture

| Layer | Target |
| --- | --- |
| Angular SPA | **Vercel** (static hosting) |
| Django REST API | A cloud backend of your choice (not Vercel) |
| Database | Managed PostgreSQL |

`frontend/vercel.json` is configured for this:

- `framework: null` with `buildCommand: npm run build` — Vercel runs the Angular CLI
  rather than guessing a framework.
- `outputDirectory: dist/frontend/browser`.
- A rewrite of `/api/(.*)` to the Django host, so the deployed SPA keeps using
  relative URLs and needs no CORS.
- An SPA fallback of every non-`/assets/` path to `index.html`, so deep links like
  `/book/acme-clinic/date` work after a refresh.
- Immutable one-year caching for hashed `/assets/`.

Two things must be set before deploying:

1. Replace `REPLACE-WITH-YOUR-DJANGO-HOST` in `vercel.json` with the real API host.
2. Add that host (and the Vercel origin) to `DJANGO_ALLOWED_HOSTS` /
   `CORS_ALLOWED_ORIGINS` on the backend.

`src/environments/` holds the frontend API base URL. It defaults to the relative
`/api`, which works with the Vercel rewrite and with the dev proxy unchanged. No
production backend URL is invented in the repository.

**Nothing has been deployed as part of this work**, and Django must not be deployed to
Vercel — it needs a long-running Python process and a real database connection pool.

---

## 20. Known limitations

**Security / hardening**

- Tokens are stored in `localStorage`, which is readable by any injected script.
  HttpOnly cookies would remove that risk but need a CSRF strategy; this is a
  deliberate, documented trade-off rather than an oversight.
- Throttling is per-IP and uses the local cache backend. Behind a proxy, configure
  `USE_X_FORWARDED_HOST`/`SECURE_PROXY_SSL_HEADER` or the limit keys on the proxy. For
  multiple API instances, point `CACHES` at Redis.
- No email verification and no password reset flow.

**Functional**

- Customer registration refuses an email that already exists as a staff-created
  `Customer`, so a walk-in record cannot yet be claimed by a login.
- `DELETE` is not implemented on any collection; there is no pagination or search.
- No rescheduling — a customer cancels and rebooks.
- No guest checkout; a booking requires a customer login.

**Operational**

- `Customer.email` is `blank=True` but participates in a unique constraint with
  `organization`, so multiple blank emails within one organization would conflict.
- Working hours can be created but not edited through the API.

**Verification limits**

- There is no browser in this development environment. Everything was verified through
  the build, both test suites, and direct HTTP requests against the running servers —
  **not** by clicking through a real browser. The manual browser checklist below should
  be run before release.

---

## Manual browser checklist

Run in Chrome against `http://localhost:4200` with both servers running.

### Administrator (14 steps)

1. Open `/register`; create an organization "Test Clinic" with an admin account.
2. Log in; confirm you land on `/dashboard`.
3. Confirm the management navigation is visible.
4. Open `/services`; create a category.
5. Create a service with a duration of 30 minutes and a price.
6. Open `/staff`; create a staff member.
7. Assign the new service to that staff member.
8. Open `/availability`; **confirm the page names the staff member** whose schedule you
   are editing.
9. Set working hours for the relevant weekday, e.g. 09:00–17:00.
10. Open `/customers`; create a customer.
11. Open `/bookings`; create a booking for that customer with that service and staff.
12. Confirm the booking shows the correct derived `end_time` (start + 30 minutes).
13. Change its status to Confirmed; verify the status colour changes.
14. Cancel it; verify the status changes and the slot becomes bookable again.

### Customer (14 steps)

1. Open `/book/<your-slug>`; confirm the organization name, address and phone appear.
2. Confirm services show duration and price.
3. Pick a service; confirm you move to the staff step.
4. Confirm **only** staff who provide that service are listed.
5. Pick a staff member; confirm you move to the date step.
6. Pick a date with working hours; confirm real time slots appear.
7. Confirm a slot already booked is disabled and states that it is booked.
8. Click a free slot; confirm you land on the confirmation summary.
9. Use the browser Back button; **confirm the previously chosen slot is still marked
   selected** and the list is not reported as empty.
10. Register a new customer account from the confirmation step.
11. Log in as that customer; confirm you land on `/customer/bookings`, **not**
    `/dashboard`.
12. Confirm no management navigation is shown.
13. Cancel the booking; confirm it disappears or shows as cancelled.
14. Re-open `/book/<slug>`, pick the same date, and **confirm the cancelled slot is
    available again**.

### Isolation (4 steps)

1. Register a second organization "Other Clinic" in another browser profile.
2. As Other Clinic's admin, confirm none of Test Clinic's services, staff, customers
   or bookings appear.
3. As a customer of one organization, open `/customer/bookings` and confirm only your
   own bookings appear.
4. In devtools, edit a booking id in the network request to one from the other
   organization and confirm the API returns **404**, not another tenant's data.

---

## Repository layout

```
backend/                  Django project
  config/                 settings, urls, wsgi
  organizations/          tenants, slugs, public API
  accounts/               users, memberships, roles, JWT views
  services/ staff/        catalogue and bookable people
  availability/           working hours, slot computation
  customers/ bookings/    customer records and bookings
  fixtures.py             optional local seed data
frontend/                 Angular 21 SPA
  src/app/core/           services, guards, interceptors, models
  src/app/features/       one folder per screen
  src/app/shared/         reusable components
  vercel.json             Vercel deployment config
  proxy.conf.mjs          dev proxy for /api
```

More detailed frontend notes live in [`frontend/README.md`](frontend/README.md).
