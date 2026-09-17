import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Application routes — TWO separate experiences.
 *
 * 1. ORGANIZATION MANAGEMENT PORTAL (authenticated ADMIN / STAFF)
 *      /login, /register          public, hidden from signed-in users
 *      /dashboard, /bookings,
 *      /customers, /services,
 *      /staff, /availability      protected by `authGuard`, rendered in AppShell
 *
 * 2. CUSTOMER BOOKING PORTAL (public)
 *      /book/:organizationSlug[/:step]
 *    Deliberately outside AppShell: no sidebar, no dashboard, no management
 *    chrome. See `features/public/public-booking.component.ts` for why it
 *    currently renders a "not available yet" state instead of data.
 *
 * Every screen is lazy-loaded, so the initial bundle only contains the shell +
 * login. Each route carries `data.title` / `data.subtitle`, which the top bar
 * and the document `<title>` both read.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginComponent),
    data: { title: 'Sign in', chromeless: true },
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register').then((m) => m.RegisterComponent),
    data: { title: 'Create your organization', chromeless: true },
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: {
          title: 'Dashboard',
          subtitle: 'Your organization at a glance',
        },
      },
      {
        path: 'bookings',
        loadComponent: () =>
          import('./features/bookings/bookings-page.component').then(
            (m) => m.BookingsPageComponent,
          ),
        data: { title: 'Bookings', subtitle: 'Manage appointments' },
      },
      {
        path: 'bookings/:id',
        loadComponent: () =>
          import('./features/bookings/booking-detail.component').then(
            (m) => m.BookingDetailComponent,
          ),
        data: { title: 'Booking', subtitle: 'Appointment details' },
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/customers/customers-page.component').then(
            (m) => m.CustomersPageComponent,
          ),
        data: { title: 'Customers', subtitle: 'Client records' },
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./features/services/services-page.component').then(
            (m) => m.ServicesPageComponent,
          ),
        data: { title: 'Services', subtitle: 'Catalogue and categories' },
      },
      {
        path: 'staff',
        loadComponent: () =>
          import('./features/staff/staff-page.component').then((m) => m.StaffPageComponent),
        data: { title: 'Staff', subtitle: 'Team members' },
      },
      {
        path: 'availability',
        loadComponent: () =>
          import('./features/availability/availability-page.component').then(
            (m) => m.AvailabilityPageComponent,
          ),
        data: { title: 'Availability', subtitle: 'Working hours per staff member' },
      },
    ],
  },
  /* ------------------------------------------------------------------------ */
  /* Customer booking portal (public, no shell, no organization data)          */
  /* ------------------------------------------------------------------------ */
  {
    path: 'book',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Book an appointment', chromeless: true },
  },
  {
    path: 'book/:organizationSlug',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Book an appointment', chromeless: true },
  },
  // The named steps of the customer flow. Each binds `step` via
  // withComponentInputBinding(), so the screen can say which stage was asked
  // for. They are separate routes rather than one `:step` wildcard so the
  // intended flow is explicit in the routing table.
  {
    path: 'book/:organizationSlug/services',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Choose a service', chromeless: true, step: 'services' },
  },
  {
    path: 'book/:organizationSlug/staff',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Choose a staff member', chromeless: true, step: 'staff' },
  },
  {
    path: 'book/:organizationSlug/date',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Pick a date and time', chromeless: true, step: 'date' },
  },
  {
    path: 'book/:organizationSlug/confirmation',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Booking confirmation', chromeless: true, step: 'confirmation' },
  },
  // Unrecognised step: still the customer portal, never a 404, so a mistyped
  // link does not drop a visitor out of the public experience.
  {
    path: 'book/:organizationSlug/:step',
    loadComponent: () =>
      import('./features/public/public-booking.component').then((m) => m.PublicBookingComponent),
    data: { title: 'Book an appointment', chromeless: true },
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
    data: { title: 'Page not found' },
  },
];
