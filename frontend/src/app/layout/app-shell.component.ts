import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet, type ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { CapabilitiesService } from '../core/services/capabilities.service';
import { ConfirmService } from '../core/services/confirm.service';
import { initials } from '../core/utils/datetime';
import { SidebarComponent } from './sidebar.component';
import { TopbarComponent } from './topbar.component';

/**
 * Application shell: sidebar + top bar + routed content.
 *
 * Every protected screen renders inside `<router-outlet />` here, so the
 * navigation chrome exists exactly once instead of being duplicated per page.
 * Toasts and the confirmation dialog are mounted here too, which is what lets
 * any component call `ToastService` / `ConfirmService` without owning markup.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The toast and confirm hosts are mounted once in the root component so the
  // customer portal and the auth screens get them too. Mounting them here as
  // well would render two of each.
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="min-h-dvh lg:pl-64">
      <div id="main-navigation">
        <app-sidebar
          [mobileOpen]="mobileOpen()"
          [username]="username()"
          [userInitials]="userInitials()"
          [roleLabel]="roleLabel()"
          (closed)="mobileOpen.set(false)"
          (logoutRequested)="logout()"
        />
      </div>

      <div class="flex min-h-dvh flex-col">
        <app-topbar
          [title]="section()"
          [subtitle]="sectionSubtitle()"
          [username]="username()"
          [userInitials]="userInitials()"
          [today]="today"
          (menuToggled)="mobileOpen.update((open) => !open)"
        />

        <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div class="mx-auto w-full max-w-7xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly capabilities = inject(CapabilitiesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mobileOpen = signal(false);

  /** Section name/subtitle, read from the matched route's `data`. */
  protected readonly section = signal('Dashboard');
  protected readonly sectionSubtitle = signal('');

  protected readonly username = this.authService.displayName;
  protected readonly userInitials = computed(() => initials(this.username()));

  /**
   * The user's own username is real data captured at login. Their ROLE is not
   * in the JWT and there is no /api/me, so it is reported from the capability
   * probe — and until that answers, nothing is claimed. The organization name
   * is deliberately absent: no endpoint exposes it (see CapabilitiesService).
   */
  protected readonly roleLabel = computed(() => {
    switch (this.capabilities.canManageCatalogue()) {
      case true:
        return 'Organization admin';
      case false:
        return 'Organization staff';
      default:
        return 'Workspace member';
    }
  });

  protected readonly today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  constructor() {
    // Determine once per session whether this user may manage the catalogue, so
    // the sidebar does not offer a STAFF member three screens that only 403.
    this.capabilities.probe();

    // Keep the header in sync with the active route, and close the mobile drawer
    // whenever navigation happens.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.mobileOpen.set(false);
        const data = this.activeRouteData();
        this.section.set(String(data['title'] ?? 'Dashboard'));
        this.sectionSubtitle.set(String(data['subtitle'] ?? ''));
      });
  }

  /** Walk to the deepest matched route that carries `data.title`. */
  private activeRouteData(): Record<string, unknown> {
    let route: ActivatedRoute | null = this.router.routerState.root;
    let data: Record<string, unknown> = {};

    while (route) {
      const snapshotData = route.snapshot.data;
      if (snapshotData && Object.keys(snapshotData).length > 0) {
        data = { ...data, ...snapshotData };
      }
      route = route.children[0] ?? null;
    }

    return data;
  }

  protected logout(): void {
    void this.confirmService
      .ask({
        title: 'Sign out?',
        message: 'You will need your credentials to get back in.',
        confirmLabel: 'Sign out',
        cancelLabel: 'Stay signed in',
        tone: 'primary',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.authService.logout();
          // Next user may hold a different role.
          this.capabilities.reset();
        }
      });
  }
}
