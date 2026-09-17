# BookingDesk — Angular frontend

A production-ready Angular 21 + Tailwind CSS 4 SPA for the existing Django REST
booking API. The backend is **unchanged** — every request this app makes goes to
an endpoint that already exists, and every field it sends is a real field on a
Django serializer.

---

## Quick start

```bash
cd frontend
npm install
npm start                 # http://localhost:4200
```

The dev server proxies `/api/*` to `http://127.0.0.1:8000`, so start Django first:

```bash
cd backend
python manage.py runserver
```

Useful scripts:

| Command                                         | What it does                                |
| ----------------------------------------------- | ------------------------------------------- |
| `npm start`                                     | Dev server with HMR + the API proxy         |
| `npm run build`                                 | Production bundle → `dist/frontend/browser` |
| `npm test`                                      | Unit tests (Vitest, 49 specs)               |
| `npx prettier --write "src/**/*.{ts,html,css}"` | Format                                      |

---

## How the API base URL is configured

There is exactly **one** place the API address is defined, and no component or
service hard-codes a host.

```
src/environments/
  environment.type.ts         the shared `Environment` interface
  environment.ts              production  → apiBaseUrl: '/api'
  environment.development.ts  development → apiBaseUrl: '/api'
```

`environment.ts` is swapped for `environment.development.ts` at build time via
`angular.json → fileReplacements`. That swap is the reason the interface lives in
its own file: if it lived in `environment.ts`, the development file would import
from itself after replacement and fail to compile.

Both environments use the **relative** path `/api`:

- **Locally** — `proxy.conf.mjs` forwards `/api/*` to Django on port 8000.
  Because the browser only ever talks to `localhost:4200`, there is no cross-origin
  request and no CORS involvement at all.
- **In production** — `/api` is a same-origin path, rewritten to your Django host
  by the deployment platform (see `vercel.json`). Nothing in the Angular code
  needs to change between environments.

To point at a fixed host instead, set `apiBaseUrl` to the full URL, e.g.
`'https://api.example.com/api'`, and add that origin to the Django
`CORS_ALLOWED_ORIGINS` setting.

---

## Project structure and what each file does

```
src/
├── index.html                      document shell, fonts, meta, <app-root>
├── main.ts                         Angular bootstrap (untouched scaffold)
├── styles.css                      THE design system: tokens + 3 shared classes
├── proxy.conf.mjs                  dev-server proxy /api → :8000
├── vercel.json                     production rewrite rules for SPA + API
└── app/
    ├── app.ts / app.html           root component — nothing but <router-outlet>
    ├── app.config.ts               provider wiring (see below)
    ├── app.routes.ts               every route, all lazy-loaded
    ├── core/                       framework-level code, no UI
    ├── shared/                     presentational components, no business logic
    ├── layout/                     the application shell
    └── features/                   one folder per page
```

### `core/` — the non-visual backbone

| File                                     | Responsibility                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/models/api.models.ts`              | **The single source of truth for the API contract.** Every request and response type. Field names are snake_case exactly as Django returns them. If the backend ever changes, this is the only file that needs updating.                                                                                   |
| `core/utils/api-errors.ts`               | Normalises the several error shapes Django emits into one `ApiError` object: HTTP status, human message, `fieldErrors` (per-field 400s) and `nonFieldErrors` (cross-field 400s). `apiErrorMessage()` renders them as readable text.                                                                        |
| `core/utils/datetime.ts`                 | All date/time handling. **Never** uses `new Date("YYYY-MM-DD")` — that parses as UTC midnight and displays as the previous day west of Greenwich. Dates are parsed by hand instead. Also: weekday maths matching Django's `Mon=0…Sun=6`, `HH:MM` ↔ `HH:MM:SS` conversion, decimal-string price formatting. |
| `core/utils/lookup.ts`                   | Because every foreign key on the API is a bare integer, this maps id → display name (`customerName`, `staffName`, `serviceName`) and provides the shared client-side search matcher.                                                                                                                       |
| `core/utils/slots.ts`                    | `computeTimeSlots()` — the bookable-slot grid. Reproduces the backend's working-hours and overlap arithmetic so the picker agrees with the server. Pure and unit-tested.                                                                                                                                   |
| `core/services/capabilities.service.ts`  | Determines, by observing one real HTTP status, whether the signed-in user may manage services/staff/availability. Drives sidebar filtering and the role label.                                                                                                                                             |
| `core/services/token.service.ts`         | The **only** file that touches `localStorage`. Stores access token, refresh token and the signed-in user's name. Exposes them as signals so any component can react to auth state without subscribing.                                                                                                     |
| `core/services/auth.service.ts`          | Login, register, refresh, logout. Register returns **no tokens** (backend behaviour), so the login screen is where tokens are obtained.                                                                                                                                                                    |
| `core/services/*.service.ts`             | One thin service per API resource: `CatalogService` (categories + services), `StaffService`, `CustomerService`, `AvailabilityService`, `BookingService`, `DashboardService`. Each exposes only the operations the backend actually supports.                                                               |
| `core/guards/auth.guard.ts`              | `authGuard` protects the app shell; `guestGuard` keeps signed-in users off `/login` and `/register`. `safeReturnUrl()` only accepts same-origin paths, so a crafted `?returnUrl=` cannot redirect off-site.                                                                                                |
| `core/interceptors/auth.interceptor.ts`  | Attaches `Authorization: Bearer <token>`; on a 401 performs **one** shared refresh and replays the request. See the auth section below.                                                                                                                                                                    |
| `core/interceptors/error.interceptor.ts` | Converts `HttpErrorResponse` into the normalised `ApiError`. Runs _before_ the auth interceptor in the array, so it sees the auth interceptor's output. Skips 400s (forms handle those) and requests marked `X-Silent-Error` (background refresh).                                                         |
| `core/routing/app-title-strategy.ts`     | Builds the browser tab title from each route's `data.title`.                                                                                                                                                                                                                                               |

### `shared/` — presentational components

Stateless building blocks with no knowledge of the API.

| Component                            | Purpose                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `button.component.ts`                | One button style for the whole app (`variant`/`size`/`loading`/`block`). Disabled styling always accompanies the disabled attribute so state is never colour-only. |
| `status-badge.component.ts`          | Booking status chip. Colours come from `shared/booking-status.ts`.                                                                                                 |
| `shared/booking-status.ts`           | Single map of the five backend statuses to label, long description and colour. Adding a status means editing this one file.                                        |
| `card` / `page-header` / `stat-card` | Layout primitives.                                                                                                                                                 |
| `spinner` / `skeleton`               | Loading indicators.                                                                                                                                                |
| `state` / `error-state`              | The two shared feedback components — see the state-handling section.                                                                                               |
| `field` / `search-input`             | Form primitives: real labels, hint text, error slots, `aria-invalid`/`aria-describedby`.                                                                           |
| `modal`                              | Accessible dialog — focus trapped, Esc to close, focus restored on close.                                                                                          |
| `confirm-host`                       | App-wide confirmation dialog. Called through `ConfirmService.ask()`, which returns an `Observable<boolean>`. **Used before every booking cancellation.**           |
| `toast-host`                         | App-wide toast stack, driven by `ToastService`.                                                                                                                    |
| `icon.component.ts`                  | Single sprite of inline SVG paths. Icons are `aria-hidden` unless labelled.                                                                                        |

### `layout/` — the application shell

`app-shell.component.ts` renders the sidebar, topbar and `<router-outlet>` **once**.
Every feature page renders only its own content inside it — no page repeats the
navigation. The shell also hosts the toast and confirm dialogs, so they are
available everywhere from a single instance. On mobile the sidebar is a slide-over
toggled from the topbar.

### `features/` — the pages

| Route                             | Folder                             | What it does                                                                                                    |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/login`, `/register`             | `features/auth/`                   | Auth forms on a shared branded `auth-layout`.                                                                   |
| `/dashboard`                      | `features/dashboard/`              | Live metrics computed from real records.                                                                        |
| `/bookings`                       | `features/bookings/bookings-page`  | Search + status/date filters, list and day views, create dialog, status actions.                                |
| `/bookings/:id`                   | `features/bookings/booking-detail` | One booking, full status transitions, inline notes editing.                                                     |
| `/services`                       | `features/services/`               | Categories and services.                                                                                        |
| `/staff`                          | `features/staff/`                  | Staff with multi-select service assignment.                                                                     |
| `/availability`                   | `features/availability/`           | Working hours for the 7 weekdays.                                                                               |
| `/customers`                      | `features/customers/`              | Customer directory.                                                                                             |
| `/book/:organizationSlug[/:step]` | `features/public/`                 | Customer booking portal — public, outside the shell, currently an honest "not available yet" state (see below). |
| anything else                     | `features/not-found/`              | 404 page.                                                                                                       |

---

## Two experiences

The application is two structurally separate things that share a design system.

**1. Organization management portal** — `/login`, `/register`, `/dashboard`,
`/bookings`, `/customers`, `/services`, `/staff`, `/availability`. Authenticated,
rendered inside `AppShell` (sidebar + topbar). The login screen reads
_"Sign in to your organization workspace"_ — a Django `User` authenticates and
belongs to an organization through its `OrganizationMembership`; the user is not
"logging into an organization".

**2. Customer booking portal** — `/book`, `/book/:organizationSlug`,
`/book/:organizationSlug/:step`. Public, deliberately **outside** `AppShell`: no
sidebar, no dashboard, no management chrome. It never shows staff management,
service management, customer management or availability management.

`features/public/public-booking.component.ts` is where the customer portal lives.
It currently renders an honest "not available yet" state — no mock services, no
sample times, no invented endpoints — because the four backend capabilities it
needs do not exist. See _Customer booking portal: backend requirements_ below.

---

## Roles and permissions

The backend splits its permissions in two, and the frontend follows that split
rather than papering over it:

| Endpoint                  | Permission            | ADMIN |  STAFF  | Anonymous |
| ------------------------- | --------------------- | :---: | :-----: | :-------: |
| `GET /api/bookings/`      | `IsOrganizationStaff` |  200  |   200   |    401    |
| `GET /api/bookings/<id>/` | `IsOrganizationStaff` |  200  |   200   |    401    |
| `GET /api/customers/`     | `IsOrganizationStaff` |  200  |   200   |    401    |
| `GET /api/categories/`    | `IsOrganizationAdmin` |  200  | **403** |    401    |
| `GET /api/services/`      | `IsOrganizationAdmin` |  200  | **403** |    401    |
| `GET /api/staff/`         | `IsOrganizationAdmin` |  200  | **403** |    401    |
| `GET /api/working-hours/` | `IsOrganizationAdmin` |  200  | **403** |    401    |

(Verified against the running API with a real `STAFF`-role member.)

Two consequences the UI handles explicitly:

- **Navigation is filtered by capability.** `CapabilitiesService` issues one silent
  `GET /api/services/` and records the status: 200 → may manage the catalogue,
  403 → may not. Services, Staff and Availability disappear from the sidebar for a
  STAFF member instead of leading to three screens that can only error. This is an
  _inference from real HTTP responses_, used only to choose which links to render.
  It is not a security boundary — the backend re-checks every request.
- **The bookings page degrades instead of failing.** It loads bookings and
  customers (readable by any member) plus services, staff and working hours
  (admin-only) in one `forkJoin`. The admin-only three are wrapped in `catchError`,
  so a 403 yields an empty list and a banner rather than taking the whole screen
  down. Without that, a STAFF member would see a hard error on a page they are
  entitled to use.

The sidebar's role line is derived the same way. It previously hard-coded
"Organization admin", which was simply false for a STAFF member; it now reads
`Organization admin` / `Organization staff` / `Workspace member` while the probe
is pending.

**The organization name cannot be displayed.** There is no `/api/me`, no
organization endpoint of any kind (`organizations/views.py` is empty and the app
has no `urls.py`), the JWT payload is only
`{token_type, exp, iat, jti, user_id}`, and every record exposes `organization`
as a bare integer id. So a header like "ABC Clinic / Welcome back, Dhanush" is
not achievable without a backend change, and the UI shows only the signed-in
username rather than inventing a name.

---

## Customer booking portal: backend requirements

None of the following exist today. They are documented, not worked around.

**1. Public organization lookup**
`Organization` has `name, email, phone, address, created_at` — **no `slug`**. There
is no `organizations/urls.py` and `organizations/views.py` is empty, so no
organization endpoint exists at all (confirmed: `/api/organizations/` → 404 even
when authenticated). Required:

```
Organization.slug = models.SlugField(max_length=100, unique=True)   # + migration
GET /api/public/organizations/<slug>/     AllowAny
    -> { name, address, phone, email }    (no member or customer data)
GET /api/public/organizations/<slug>/services/    AllowAny, is_active=True only
GET /api/public/organizations/<slug>/staff/       AllowAny, is_active=True only
GET /api/public/organizations/<slug>/availability/ AllowAny, is_available=True only
```

Until a slug exists, `/book/abc-clinic` cannot be resolved to an organization. The
frontend never lets a visitor submit an arbitrary organization id.

**2. Unauthenticated read access**
`DEFAULT_PERMISSION_CLASSES` is `IsAuthenticated` and every view sets an
organization permission, so a tokenless request gets 401 from every resource
endpoint. Public read-only views (above) are required before a visitor can see
anything.

**3. Customer authentication**
`customers.Customer` is `organization + name + email + phone` with **no `User`
foreign key**, and `OrganizationMembership.Role` is only `ADMIN | STAFF`. There is
no customer account, login or registration. Required:

- `Customer.user = OneToOneField(User, null=True)` **or** a separate
  `CustomerAccount` model, plus a `CUSTOMER` role / a distinct permission class
- `POST /api/auth/customer/register/` — email + password, creating a `User` linked
  to a `Customer`
- `POST /api/auth/customer/login/` — token pair
- authorization that scopes a customer to _their own_ bookings only, never to the
  organization's other customers

**4. Customer booking permission**
`BookingListCreateView.permission_classes = [IsOrganizationStaff]`. A customer
cannot create a booking through the existing API, and this is stated plainly:

> Customer booking requires a backend endpoint/permission model because the
> current booking API requires `IsOrganizationStaff`.

A public booking endpoint would also need its own validation (the current
serializer takes `organization` from the authenticated user's membership, which a
customer would not have) and its own rate limiting.

**Guest booking without login** is blocked by the same thing: there is no
permission class under which an anonymous caller may create a `Booking`. A
frontend-only workaround is not implemented and should not be.

---

## Booking creation flow

`features/bookings/booking-form.component.ts` runs the dependencies in the order
they actually occur:

```
Service  ->  compatible staff  ->  date  ->  available time  ->  customer  ->  confirm
```

- **Service** decides who can perform it and how long it takes.
- **Staff** is narrowed to active members whose `services` array contains the
  chosen service — the same rule `BookingSerializer.validate()` enforces. Capable
  but inactive staff are named rather than silently hidden.
- **Date** decides the weekday, and therefore which `WorkingHours` row applies.
- **Available time** is a slot grid produced by `core/utils/slots.ts`.
- **Customer** is independent, so it comes last.
- **`end_time` is never an input and never sent.** It is shown read-only as
  `start + duration_minutes`, which is exactly how the server derives it.

`computeTimeSlots()` reproduces the backend arithmetic so the picker and the
server agree:

```
working hours : valid    <=>  start >= wh.start_time  AND  end <= wh.end_time
overlap       : conflict <=>  start < booking.end_time AND end > booking.start_time
                over bookings for the same staff + date, excluding CANCELLED
```

Cross-checked against the live API for a 30-minute service inside 09:00–17:00 with
an existing 09:00–09:30 booking: `09:00` and `09:15` rejected (400), `09:30`
accepted (201, touching is not overlapping), `16:30` accepted as the last valid
start, `16:45` and `08:45` rejected. Covered by 11 unit tests.

This is a convenience, not an authority. The server re-validates on submit and its
message is surfaced verbatim — including for a slot someone else took in the
meantime.

---

## Authentication

**Login** → `POST /api/auth/login/` returns `{ access, refresh }`. Both are stored
by `TokenService` along with the username (the JWT payload contains no profile
endpoint to read it from, so it is captured at login time).

**Every request** passes through `authInterceptor`, which adds
`Authorization: Bearer <access>`.

**Expiry** is handled reactively rather than by decoding the token's `exp` claim:

1. A request comes back `401`.
2. The interceptor calls `POST /api/auth/refresh/`. Concurrent 401s share a single
   refresh (`shareReplay`), so five simultaneous dashboard calls trigger one refresh.
3. The new access token is **persisted** and the original request is replayed once.
4. If the refresh itself fails, tokens are cleared and the user is sent to
   `/login?returnUrl=<where they were>`.

Three guarantees, each pinned by a unit test:

- a request is retried **at most once** (no infinite refresh loop);
- only **one** refresh runs at a time;
- the auth endpoints themselves never get a token attached, so a failing refresh
  cannot recurse.

**Register** → `POST /api/auth/register/` creates the user _and_ their organization
in one call and returns only `{ id, username, email }` — **no tokens**. The UI
therefore sends the user to `/login` with a confirmation message. The organization
is derived server-side; there is no organization picker anywhere in the UI.

**Logout** clears storage, resets the auth signals and navigates to `/login`.

---

## Loading / empty / error states

Every data page uses the same shape:

```ts
loading = signal(true);
error = signal<ApiError | null>(null);
list = signal<Thing[]>([]);

load() { /* sets loading, clears error, fills list, sets error on failure */ }
```

and the same template structure:

- **Loading** — `<app-skeleton>` shaped like the content that is about to appear.
- **Error** — `<app-error-state>` with the real server message and a **Retry**
  button that calls `load()` again. A network failure is labelled as such rather
  than reported as a server error.
- **Empty (nothing exists yet)** — an invitation to create the first record, with
  a direct action button.
- **Empty (filters too narrow)** — a distinct message with a "Clear filters" button.

These last two are deliberately different. Conflating them tells a user their
organisation has no customers when it actually has two hundred that simply do not
match the search box.

---

## Client-side search and filtering

The API exposes **no** pagination, search or filter parameters (the viewsets are
plain `ModelViewSet`s), so filtering happens in the browser:

- `filtered = computed(() => …)` recomputes only when the source list or the
  filter signals change — it is a signal, not a function called from the template,
  so nothing is recomputed on every change-detection pass.
- Search is **not** debounced: it filters an array already in memory, so each
  keystroke is a synchronous pass over the loaded rows with no request behind it.
  Debouncing would only add latency. If server-side search is added later, this is
  the line that would need a debounce.
- A `ResultCountComponent` prints "Showing 3 of 48 services" when narrowed and
  just "48 services" when not, so a filtered list is never mistaken for a short one.
- Every filter is visible and clearable.

This works well into the thousands of rows. Beyond that, the backend would need
pagination; the code is structured so that change is local — swap the service's
list method to accept parameters and replace the `computed` with a server round
trip. No component would need to change.

---

## Booking creation — the dynamic dependencies

`features/bookings/booking-form.component.ts` implements the two rules from the
spec:

1. **Staff filtered by the selected service.** Every service is matched against
   each staff member's `services` id array as the user picks a service. Staff who
   do not provide it are removed, and the select says why — "Only staff who
   perform the selected service are listed." — rather than silently showing a
   short list. If the current selection becomes invalid it is cleared. If no one
   performs the chosen service, the select says so instead of appearing broken.
2. **No end-time field.** The backend computes `end_time` from
   `start_time + service.duration_minutes` and marks it read-only. The form shows a
   read-only _preview_ of the computed end time so the user knows what they are
   booking, but never submits it.

---

## Security boundary

Organization isolation is enforced **entirely** by Django. Every endpoint filters
its queryset by the authenticated user's organization, and the serializers reject
cross-organization foreign keys. This app:

- never sends an organization id;
- never shows an organization picker;
- never filters by organization on the client.

Verified end-to-end: a second organization sees zero records from the first, gets
`404` reading or modifying the first organization's booking, and gets `400`
(`Customer does not belong to your organization.`) trying to book against it.

Backend validation is never duplicated as a client-side rule that would replace
it. The client validates only what improves the UX (required fields, format); the
authoritative checks — overlap, working hours, past dates, staff-service
assignment, cross-organization references — all run server-side, and their messages
are displayed verbatim.

---

## Accessibility

- Real `<label for>` on every input; `<button>` elements for every action.
- Focus-visible ring on all interactive elements; the modal traps focus, closes on
  Esc and restores focus to the trigger.
- Status is never communicated by colour alone — badges carry a text label and
  icons carry text or an `sr-only` span.
- Invalid fields set `aria-invalid` and point at their message with
  `aria-describedby`; error messages are `role="alert"`.
- Tables use real `<th scope="col">`; the mobile card list keeps the same semantics.
- `prefers-reduced-motion` is honoured.

---

## Deployment

### Vercel

1. **Import** the repository.
2. **Root directory:** `frontend`
3. **Framework preset:** Angular
4. **Build command:** `npm run build` (already the default from `package.json`)
5. **Output directory:** `dist/frontend/browser` (already set in `vercel.json`)
6. **Environment variables** — none are required by the frontend build, because
   `apiBaseUrl` is the relative path `/api`.
7. **Route the API.** `vercel.json` contains a placeholder rewrite:

   ```json
   { "source": "/api/(.*)", "destination": "https://YOUR-DJANGO-HOST/api/$1" }
   ```

   Replace `YOUR-DJANGO-HOST` with your deployed backend, **or** delete that rule
   and configure the same rewrite in the Vercel dashboard.

   If you would rather not rewrite, set `apiBaseUrl` in
   `src/environments/environment.ts` to the full backend URL and add your Vercel
   domain to Django's `CORS_ALLOWED_ORIGINS`.

8. **SPA routing** is handled by the catch-all rewrite to `/index.html`, so deep
   links like `/bookings/12` work on a hard refresh.

### Any static host

`npm run build`, then serve `dist/frontend/browser` with a catch-all rewrite of
unknown paths to `index.html`, and a rewrite of `/api/*` to the backend.

> Note: `angular.json` sets `optimization.fonts.inline = false` in the production
> configuration. Without it the build tries to download the Inter font from
> Google at build time and fails on any machine without outbound access to
> `fonts.googleapis.com`. The font is loaded by the browser at runtime instead,
> with a full system font stack as fallback.

---

## Notes on the API

These are properties of the existing backend that shaped the frontend. They are
**not** frontend bugs, and the frontend is written to work around them rather than
to paper over them:

- **No `DELETE` on any endpoint.** Records cannot be removed. The booking detail
  screen uses `CANCELLED` instead, and the other pages say plainly that deletion
  is not available.
- **Only bookings have a detail route.** Categories, services, staff, working
  hours and customers are list-and-create only, so those pages offer create but
  not edit.
- **No pagination or search parameters.** Hence client-side filtering.
- **`PATCH /api/bookings/<id>/` with only `status`/`notes`** deliberately skips
  the availability recalculation — that is what makes status transitions and note
  editing safe, and it is why the UI sends those fields alone.
- **`end_time` is read-only** and derived from the service duration.
- **Foreign keys are integers**, so names are resolved from the lists already
  loaded on each page.
- **The `status` field cannot be set to an empty string** on update; the detail
  screen sends it only when it actually changes.
