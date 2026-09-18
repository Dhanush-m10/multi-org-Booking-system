import { Injectable, computed, signal } from '@angular/core';

import type { PublicService, PublicStaff } from '../models/api.models';

/**
 * In-progress customer booking, carried across the `/book/<slug>/<step>` routes.
 *
 * Each step of the customer flow is its own route, so the component is destroyed
 * between steps. This root-provided service is what keeps the selection alive
 * while the visitor walks service -> staff -> date -> confirmation.
 *
 * It holds ids plus the display copies of what was chosen, so the confirmation
 * step can render a summary without refetching (and so a summary can never
 * disagree with what is about to be submitted — both come from these signals).
 *
 * Scoped to one organization: `slug` is part of the draft, and `reset()` is
 * called whenever the slug in the URL changes, so a visitor who switches from
 * one organization's portal to another's never carries a stale service id
 * across. That matters because service ids are only meaningful inside their own
 * organization, and the backend would reject a foreign one anyway.
 */
@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  readonly slug = signal('');

  readonly service = signal<PublicService | null>(null);
  readonly staff = signal<PublicStaff | null>(null);
  /** "YYYY-MM-DD" */
  readonly date = signal('');
  /** "HH:MM:SS" */
  readonly startTime = signal('');
  /** "HH:MM:SS" — what the server will derive and store. */
  readonly endTime = signal('');
  readonly notes = signal('');

  readonly readyForStaff = computed(() => this.service() !== null);
  readonly readyForDate = computed(() => this.service() !== null && this.staff() !== null);
  readonly readyForConfirmation = computed(
    () =>
      this.service() !== null &&
      this.staff() !== null &&
      this.date() !== '' &&
      this.startTime() !== '',
  );

  /** True when the draft belongs to a different organization than the URL. */
  isFor(slug: string): boolean {
    return this.slug() === slug;
  }

  /** Start (or restart) a draft for `slug`, discarding any previous selection. */
  begin(slug: string): void {
    this.slug.set(slug);
    this.clearSelection();
  }

  /** Drop the chosen service/staff/slot but keep the organization. */
  clearSelection(): void {
    this.service.set(null);
    this.staff.set(null);
    this.date.set('');
    this.startTime.set('');
    this.endTime.set('');
    this.notes.set('');
  }

  /** Drop everything, e.g. after a successful booking. */
  reset(): void {
    this.slug.set('');
    this.clearSelection();
  }
}
