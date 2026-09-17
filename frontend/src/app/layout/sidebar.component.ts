import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CapabilitiesService } from '../core/services/capabilities.service';
import { IconComponent, type IconName } from '../shared/components/icon.component';

/**
 * Primary navigation.
 *
 * Desktop: fixed 16rem column.
 * Mobile:  off-canvas drawer with a backdrop, opened from the top bar.
 *
 * There is deliberately no "Organization ID" field anywhere — the backend
 * resolves the organization from the JWT, so the UI never asks for one.
 */

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  /** One-line description shown under the label on desktop. */
  hint: string;
  /**
   * Hidden from users who cannot use the screen. Services, Staff and
   * Availability are `IsOrganizationAdmin` on the backend, so a STAFF-role
   * member would only ever see a 403 there. Hiding the link is a courtesy, not
   * a security measure — the backend enforces it regardless.
   */
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', hint: 'Overview' },
  { label: 'Bookings', path: '/bookings', icon: 'calendar', hint: 'Appointments' },
  { label: 'Customers', path: '/customers', icon: 'users', hint: 'Client records' },
  { label: 'Services', path: '/services', icon: 'scissors', hint: 'Catalogue', adminOnly: true },
  { label: 'Staff', path: '/staff', icon: 'user', hint: 'Team members', adminOnly: true },
  {
    label: 'Availability',
    path: '/availability',
    icon: 'clock',
    hint: 'Working hours',
    adminOnly: true,
  },
];

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <!-- Mobile backdrop -->
    @if (mobileOpen()) {
      <button
        type="button"
        class="fixed inset-0 z-40 cursor-default bg-slate-900/50 lg:hidden"
        aria-label="Close navigation"
        (click)="closed.emit()"
      ></button>
    }

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900
             transition-transform duration-200 ease-out
             lg:translate-x-0"
      [class.-translate-x-full]="!mobileOpen()"
      [class.max-lg:invisible]="!mobileOpen()"
    >
      <!-- Brand -->
      <div class="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span
          class="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"
          aria-hidden="true"
        >
          <app-icon name="calendar" class="size-4.5" />
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-white">BookingDesk</p>
          <p class="truncate text-[11px] text-slate-400">Multi-org scheduling</p>
        </div>

        <button
          type="button"
          class="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
          (click)="closed.emit()"
        >
          <app-icon name="close" class="size-4" />
        </button>
      </div>

      <!-- Nav -->
      <nav class="scroll-slim flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
        <p class="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          Workspace
        </p>

        @for (item of nav(); track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive
            #rla="routerLinkActive"
            [class]="linkClass(rla.isActive)"
            [attr.aria-current]="rla.isActive ? 'page' : null"
            (click)="closed.emit()"
          >
            <app-icon
              [name]="item.icon"
              class="size-4.5 shrink-0"
              [class]="iconClass(rla.isActive)"
            />
            <span class="flex-1 truncate">{{ item.label }}</span>
            @if (rla.isActive) {
              <span class="size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true"></span>
            }
          </a>
        }
      </nav>

      <!-- Signed-in user -->
      <div class="shrink-0 border-t border-white/10 p-3">
        <div class="flex items-center gap-3 rounded-lg px-2 py-2">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {{ userInitials() }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-white">
              {{ username() || 'Signed in' }}
            </p>
            <!--
              Derived from the observed capability, never assumed. There is no
              /api/me and the JWT carries no role, so this reflects what the
              backend actually allowed (see CapabilitiesService). The
              organization NAME cannot be shown at all: no endpoint returns it
              and records expose the organization as a bare integer id.
            -->
            <p class="truncate text-[11px] text-slate-400">{{ roleLabel() }}</p>
          </div>
        </div>

        <button
          type="button"
          class="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                 text-slate-300 transition hover:bg-white/5 hover:text-white"
          (click)="logoutRequested.emit()"
        >
          <app-icon name="logout" class="size-4.5 shrink-0 text-slate-400" />
          Sign out
        </button>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  readonly mobileOpen = input(false);
  readonly username = input('');
  readonly userInitials = input('?');
  readonly roleLabel = input('Workspace member');

  readonly closed = output<void>();
  readonly logoutRequested = output<void>();

  private readonly capabilities = inject(CapabilitiesService);

  /**
   * Admin-only links are dropped once the capability probe says the user cannot
   * manage the catalogue. While the probe is unanswered (`null`) every link is
   * shown, so an ADMIN never sees a truncated menu on first paint.
   */
  protected readonly nav = computed(() => {
    const canManage = this.capabilities.canManageCatalogue();
    if (canManage !== false) {
      return NAV;
    }
    return NAV.filter((item) => !item.adminOnly);
  });

  /**
   * Full literal class strings (rather than many `[class.x]` bindings) keep the
   * active and inactive styles from fighting each other on hover.
   */
  protected linkClass(active: boolean): string {
    return (
      'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ' +
      (active
        ? 'bg-brand-600/15 text-white hover:bg-brand-600/25'
        : 'text-slate-300 hover:bg-white/5 hover:text-white')
    );
  }

  protected iconClass(active: boolean): string {
    return active ? 'text-brand-300' : 'text-slate-400';
  }
}
