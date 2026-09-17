import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Application routes.
 *
 *   /login, /register          public, and hidden from signed-in users
 *   /dashboard, /bookings, ... protected by `authGuard`, rendered in AppShell
 *
 * Every protected screen is lazy-loaded, so the initial bundle only contains
 * the shell + login. Each route carries `data.title` / `data.subtitle`, which
 * the top bar and the document `<title>` both read.
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
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
    data: { title: 'Page not found' },
  },
];
