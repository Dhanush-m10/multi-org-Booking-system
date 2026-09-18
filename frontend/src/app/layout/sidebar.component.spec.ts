import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { CapabilitiesService } from '../core/services/capabilities.service';
import { SidebarComponent } from './sidebar.component';

/**
 * The sidebar is the one place a STAFF member is told which parts of the app
 * they can actually use. Getting this wrong means either hiding admin screens
 * from an admin, or handing a STAFF member three links that can only 403.
 */
describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let root: HTMLElement;
  let capabilities: CapabilitiesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent, RouterTestingModule],
    }).compileComponents();

    capabilities = TestBed.inject(CapabilitiesService);
    fixture = TestBed.createComponent(SidebarComponent);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const labels = () =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('nav a')).map(
      (link) => link.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  it('shows every link while the capability is still unknown', () => {
    // An admin must never see a truncated menu on first paint, before the
    // probe has answered.
    expect(capabilities.canManageCatalogue()).toBeNull();

    const shown = labels();
    for (const expected of [
      'Dashboard',
      'Bookings',
      'Customers',
      'Services',
      'Staff',
      'Availability',
    ]) {
      expect(shown.some((label) => label.startsWith(expected))).toBe(true);
    }
  });

  it('shows every link to a user who may manage the catalogue', () => {
    capabilities.canManageCatalogue.set(true);
    fixture.detectChanges();

    const shown = labels();
    expect(shown.some((label) => label.startsWith('Services'))).toBe(true);
    expect(shown.some((label) => label.startsWith('Staff'))).toBe(true);
    expect(shown.some((label) => label.startsWith('Availability'))).toBe(true);
  });

  it('hides the admin-only screens from a STAFF member', () => {
    capabilities.canManageCatalogue.set(false);
    fixture.detectChanges();

    const shown = labels();
    expect(shown.some((label) => label.startsWith('Services'))).toBe(false);
    expect(shown.some((label) => label.startsWith('Staff'))).toBe(false);
    expect(shown.some((label) => label.startsWith('Availability'))).toBe(false);
  });

  it('keeps the screens a STAFF member can actually use', () => {
    capabilities.canManageCatalogue.set(false);
    fixture.detectChanges();

    const shown = labels();
    expect(shown.some((label) => label.startsWith('Dashboard'))).toBe(true);
    expect(shown.some((label) => label.startsWith('Bookings'))).toBe(true);
    expect(shown.some((label) => label.startsWith('Customers'))).toBe(true);
  });

  it('never offers a way to choose an organization', () => {
    // The backend derives the organization from the JWT. There must be no
    // input, select or link anywhere in the navigation that sets one.
    expect(root.querySelectorAll('input, select, textarea').length).toBe(0);
    expect((root.textContent ?? '').toLowerCase()).not.toContain('organization id');
  });

  it('shows the role label it is given rather than a hard-coded one', () => {
    fixture.componentRef.setInput('roleLabel', 'Organization staff');
    fixture.detectChanges();
    expect(root.textContent).toContain('Organization staff');

    fixture.componentRef.setInput('roleLabel', 'Organization admin');
    fixture.detectChanges();
    expect(root.textContent).toContain('Organization admin');
  });

  it('exposes sign-out as a real button, not a clickable div', () => {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const signOut = buttons.find((button) => /sign out/i.test(button.textContent ?? ''));

    expect(signOut).toBeDefined();
    expect(signOut!.getAttribute('type')).toBe('button');
  });
});
