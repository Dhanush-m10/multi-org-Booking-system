import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { BookingService } from '../../core/services/booking.service';
import { CustomerService } from '../../core/services/customer.service';
import { ToastService } from '../../core/services/toast.service';
import type { Customer } from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import { formatDateTime, initials } from '../../core/utils/datetime';
import { matches, searchable } from '../../core/utils/lookup';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { EmptyStateComponent } from '../../shared/components/state.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import {
  ResultCountComponent,
  SearchInputComponent,
} from '../../shared/components/search-input.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

/**
 * Customers.
 *
 *   GET|POST /api/customers/
 *
 * The booking count per customer is derived from `GET /api/bookings/` — the
 * customer endpoint does not return one, and the count must never be invented.
 * Search and sorting are client-side because the backend exposes no query
 * parameters; `CustomerService` is shaped so server-side filtering can be added
 * later without touching this component's template.
 */
type SortKey = 'name' | 'recent' | 'bookings';

@Component({
  selector: 'app-customers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    FieldComponent,
    IconComponent,
    ModalComponent,
    PageHeaderComponent,
    ResultCountComponent,
    SearchInputComponent,
    SkeletonComponent,
  ],
  templateUrl: './customers-page.component.html',
})
export class CustomersPageComponent {
  private readonly customerService = inject(CustomerService);
  private readonly bookingService = inject(BookingService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly customers = signal<Customer[]>([]);
  /** Booking counts keyed by customer id. */
  protected readonly bookingCounts = signal<Map<number, number>>(new Map());

  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('name');

  /* ------------------------------ create form ------------------------------ */

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    // The model allows a blank email, but it is part of a unique constraint on
    // (organization, email), so an empty string would collide on the second
    // blank-email customer. Treat it as required in the UI.
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.maxLength(20)]],
  });

  constructor() {
    this.load();
    // Deep links such as /customers?create=1 open the dialog immediately.
    if (this.route.snapshot.queryParamMap.get('create') === '1') {
      this.openForm();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    // Both lists are needed for the table, so they are fetched together.
    forkJoin({
      customers: this.customerService.getAll(),
      bookings: this.bookingService.getAll(),
    }).subscribe({
      next: ({ customers, bookings }) => {
        const counts = new Map<number, number>();
        for (const booking of bookings) {
          counts.set(booking.customer, (counts.get(booking.customer) ?? 0) + 1);
        }
        this.customers.set(customers);
        this.bookingCounts.set(counts);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /* -------------------------------- filtering ------------------------------- */

  protected readonly filtered = computed(() => {
    const term = this.search();
    const counts = this.bookingCounts();
    const rows = this.customers().filter((customer) =>
      matches(searchable(customer.name, customer.email, customer.phone), term),
    );

    switch (this.sort()) {
      case 'recent':
        return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
      case 'bookings':
        return [...rows].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
      default:
        return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  protected setSort(key: SortKey): void {
    this.sort.set(key);
  }

  protected clearSearch(): void {
    this.search.set('');
  }

  /* --------------------------------- form ---------------------------------- */

  protected openForm(): void {
    this.form.reset({ name: '', email: '', phone: '' });
    this.formError.set('');
    this.fieldErrors.set({});
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (this.saving()) {
      return;
    }
    this.formOpen.set(false);
  }

  protected fieldError(name: 'name' | 'email' | 'phone'): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return name === 'email' ? 'Email is required.' : 'Name is required.';
    }
    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }
    if (control.hasError('maxlength')) {
      return `Keep this under ${control.getError('maxlength').requiredLength} characters.`;
    }
    return 'Please check this field.';
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.fieldErrors.set({});

    this.customerService.create(this.form.getRawValue()).subscribe({
      next: (customer) => {
        this.saving.set(false);
        this.formOpen.set(false);
        // Insert locally so the list updates without a second round trip.
        this.customers.update((list) => [...list, customer]);
        this.toast.success(`“${customer.name}” was added.`, 'Customer added');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const apiError = toApiError(err);
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(apiError.fieldErrors)) {
          if (messages.length > 0) {
            mapped[key] = messages[0]!;
          }
        }
        this.fieldErrors.set(mapped);
        this.formError.set(
          Object.keys(mapped).length > 0 ? 'Some details need attention.' : apiError.message,
        );
      },
    });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected count(id: number): number {
    return this.bookingCounts().get(id) ?? 0;
  }

  protected readonly formatDateTime = formatDateTime;
  protected readonly initials = initials;
}
