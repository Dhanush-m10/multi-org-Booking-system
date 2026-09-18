/**
 * TypeScript models for the Multi-Org Booking System.
 *
 * IMPORTANT — these mirror the Django REST Framework serializers exactly.
 * Every field name below was read from the backend serializers and confirmed
 * against a live response, so do not rename or "clean up" fields to camelCase:
 * the API speaks snake_case and these interfaces are the contract.
 *
 * Note on relations: the API returns plain integer primary keys for related
 * objects (e.g. `Booking.customer` is `number`, not a `Customer` object).
 * Components resolve those ids to display names using the lists they already
 * fetched. Never invent nested objects here.
 */

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

/** POST /api/auth/register/ -> 201 (no tokens are returned by this endpoint) */
export interface RegisteredUser {
  id: number;
  username: string;
  email: string;
}

/** POST /api/auth/login/ -> 200 */
export interface LoginResponse {
  access: string;
  refresh: string;
}

/** POST /api/auth/refresh/ -> 200 (the refresh token is NOT rotated) */
export interface RefreshResponse {
  access: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  organization_name: string;
  organization_email: string;
  organization_phone: string;
  organization_address: string;
}

/** `accounts.models.OrganizationMembership.Role` */
export type OrganizationRole = 'ADMIN' | 'STAFF' | 'CUSTOMER';

/**
 * The signed-in user, as far as the frontend can know it.
 *
 * `role` and the organization fields come from `GET /api/auth/me/`, which is
 * fetched right after login. They are display and navigation metadata only —
 * every authorization decision is made by the backend's permission classes, so
 * editing localStorage here can widen nothing.
 */
export interface SessionUser {
  id: number;
  username: string;
  email: string;
  /** Null when the user has no organization membership, or before `me` loads. */
  role?: OrganizationRole | null;
  /** Organization display name; not used to scope any request. */
  organizationName?: string;
  organizationSlug?: string | null;
}

/** GET /api/auth/me/ -> 200 — `accounts.serializers.CurrentUserSerializer` */
export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  organization: { id: number; name: string; slug: string } | null;
  role: OrganizationRole | null;
  /** Set for CUSTOMER accounts only. */
  customer_id: number | null;
}

/** POST /api/auth/customer/register/ -> 201 (no tokens; log in separately) */
export interface CustomerRegisterPayload {
  /** The organization's public slug, taken from the /book/<slug> URL. */
  organization_slug: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

/* -------------------------------------------------------------------------- */
/* Organization                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `organizations.models.Organization`.
 *
 * Only exposed to admins through `GET /api/auth/me/` (as `CurrentUser`'s nested
 * `organization`). There is no management CRUD endpoint for organizations.
 */
export interface Organization {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Public customer portal                                                     */
/*                                                                            */
/* `GET /api/public/organizations/<slug>/...` — unauthenticated, read-only.    */
/* These are deliberately separate interfaces from the management models       */
/* above: the public serializers are plain `Serializer` classes with an         */
/* explicit field list, so they omit `organization`, staff contact details and  */
/* every primary key the visitor does not need. Do not "reuse" `Service` or     */
/* `Staff` here — the shapes genuinely differ.                                  */
/* -------------------------------------------------------------------------- */

/** GET /api/public/organizations/<slug>/ -> 200 */
export interface PublicOrganization {
  slug: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

/** Nested inside `PublicService` — the only relation the public API expands. */
export interface PublicCategory {
  id: number;
  name: string;
}

/** GET /api/public/organizations/<slug>/services/ -> 200 (active only) */
export interface PublicService {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  /** DecimalField -> string, e.g. "40.00" */
  price: string;
  category: PublicCategory;
}

/** GET /api/public/organizations/<slug>/staff/ -> 200 (active only) */
export interface PublicStaff {
  id: number;
  name: string;
  specialization: string;
  /** Ids of the services this person performs. No email or phone is exposed. */
  service_ids: number[];
}

/** GET /api/public/organizations/<slug>/availability/ -> 200 */
export interface PublicWorkingHours {
  staff: number;
  weekday: Weekday;
  /** "HH:MM:SS" */
  start_time: string;
  /** "HH:MM:SS" */
  end_time: string;
}

/** One offered start time. `available: false` means taken, and says why. */
export interface AvailabilitySlot {
  /** "HH:MM:SS" */
  start: string;
  /** "HH:MM:SS" — what the server will store as `end_time`. */
  end: string;
  available: boolean;
  reason: 'booked' | null;
}

/** GET /api/public/organizations/<slug>/availability/slots/ -> 200 */
export interface AvailabilitySlotsResponse {
  service: number;
  staff: number;
  /** "YYYY-MM-DD" */
  date: string;
  duration_minutes: number;
  /** Null when the staff member does not work that weekday. */
  working_hours: PublicWorkingHours | null;
  slots: AvailabilitySlot[];
}

/* -------------------------------------------------------------------------- */
/* Customer self-service                                                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/customer/bookings/ -> 201
 *
 * Note what is absent: no `customer`, no `organization` and no `status`. The
 * backend derives the first two from the authenticated user and pins the third
 * to PENDING; sending them has no effect.
 */
export interface CustomerBookingPayload {
  service: number | null;
  staff: number | null;
  /** "YYYY-MM-DD" */
  booking_date: string;
  /** "HH:MM:SS" */
  start_time: string;
  notes: string;
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

/** GET|POST /api/categories/ — `services.serializers.ServiceCategorySerializer` */
export interface ServiceCategory {
  id: number;
  /** Read-only. Set by the backend from the authenticated user. */
  organization: number;
  name: string;
  description: string;
  created_at: string;
}

export interface ServiceCategoryPayload {
  name: string;
  description: string;
}

/** GET|POST /api/services/ — `services.serializers.ServiceSerializer` */
export interface Service {
  id: number;
  /** Read-only. */
  organization: number;
  /** FK id -> ServiceCategory */
  category: number;
  name: string;
  description: string;
  duration_minutes: number;
  /** DecimalField is serialized as a string, e.g. "15.00" */
  price: string;
  is_active: boolean;
  created_at: string;
}

export interface ServicePayload {
  category: number | null;
  name: string;
  description: string;
  duration_minutes: number | null;
  price: string | number | null;
  is_active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

/** GET|POST /api/staff/ — `staff.serializers.StaffSerializer` */
export interface Staff {
  id: number;
  /** Read-only. */
  organization: number;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  /** M2M -> Service, serialized as an array of ids */
  services: number[];
  is_active: boolean;
  created_at: string;
}

export interface StaffPayload {
  name: string;
  email: string;
  phone: string;
  specialization: string;
  services: number[];
  is_active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

/** GET|POST /api/customers/ — `customers.serializers.CustomerSerializer` */
export interface Customer {
  id: number;
  /** Read-only. */
  organization: number;
  name: string;
  email: string;
  phone: string;
  created_at: string;
}

export interface CustomerPayload {
  name: string;
  email: string;
  phone: string;
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Weekday integer used by the API.
 * `availability.models.WorkingHours.WeekDay` — Monday is 0, Sunday is 6.
 * This matches JavaScript's `Date.getDay()` shifted by one, so use the helpers
 * in `core/utils/datetime.ts` rather than doing the arithmetic inline.
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** GET|POST /api/working-hours/ — `availability.serializers.WorkingHoursSerializer` */
export interface WorkingHours {
  id: number;
  /** Read-only. */
  organization: number;
  /** FK id -> Staff */
  staff: number;
  weekday: Weekday;
  /** "HH:MM:SS" */
  start_time: string;
  /** "HH:MM:SS" */
  end_time: string;
  is_available: boolean;
}

export interface WorkingHoursPayload {
  staff: number | null;
  weekday: Weekday | null;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

/** `bookings.models.Booking.Status` */
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

/** GET|POST /api/bookings/ and GET|PUT|PATCH /api/bookings/:id/ */
export interface Booking {
  id: number;
  /** Read-only. */
  organization: number;
  /** FK id -> Customer */
  customer: number;
  /** FK id -> Service */
  service: number;
  /** FK id -> Staff */
  staff: number;
  /** "YYYY-MM-DD" */
  booking_date: string;
  /** "HH:MM:SS" */
  start_time: string;
  /** "HH:MM:SS" — READ-ONLY, computed by the backend from service duration */
  end_time: string;
  status: BookingStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Creating a booking: never send `end_time` — the backend derives it from
 * `service.duration_minutes` and rejects client-supplied values.
 */
export interface BookingPayload {
  customer: number | null;
  service: number | null;
  staff: number | null;
  /** "YYYY-MM-DD" */
  booking_date: string;
  /** "HH:MM:SS" */
  start_time: string;
  status: BookingStatus;
  notes: string;
}

/**
 * The only mutations the detail endpoint accepts without re-running the full
 * availability check. `bookings.serializers.BookingSerializer.validate`
 * short-circuits when the payload is a subset of {status, notes}.
 */
export interface BookingStatusPayload {
  status?: BookingStatus;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/** Shape of a DRF validation error body (HTTP 400). */
export type ApiFieldErrors = Record<string, string[] | Record<string, unknown>>;

/**
 * Per-page view state used by every API-driven screen so that loading / empty
 * / error states are handled consistently.
 */
export interface LoadState {
  loading: boolean;
  error: string | null;
}
