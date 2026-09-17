import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { CatalogService } from '../../core/services/catalog.service';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import type { Service, Staff } from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import { initials } from '../../core/utils/datetime';
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
 * Staff.
 *
 *   GET|POST /api/staff/
 *
 * The "services this person performs" list is loaded from `/api/services/`, so
 * the checkboxes can only ever contain services belonging to the caller's
 * organization — the backend returns nothing else. `StaffSerializer` still
 * re-validates every id on write; this picker is convenience, not a boundary.
 *
 * List + create only, so there are no edit / deactivate controls.
 */
@Component({
  selector: 'app-staff-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
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
  templateUrl: './staff-page.component.html',
})
export class StaffPageComponent {
  private readonly staffService = inject(StaffService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly services = signal<Service[]>([]);

  protected readonly search = signal('');
  protected readonly statusFilter = signal<string>('all');

  /* -------------------------------- dialog -------------------------------- */

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.maxLength(20)]],
    specialization: ['', [Validators.maxLength(150)]],
    is_active: [true],
  });

  /**
   * Selected service ids. A signal-backed Set rather than a FormArray so the
   * "select all" state stays correct under zoneless change detection.
   */
  protected readonly selectedServices = signal<Set<number>>(new Set());

  constructor() {
    this.load();
    if (this.route.snapshot.queryParamMap.get('create') === '1') {
      this.openForm();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      staff: this.staffService.getAll(),
      services: this.catalog.getServices(),
    }).subscribe({
      next: ({ staff, services }) => {
        this.staff.set(staff);
        this.services.set(services);
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
    const status = this.statusFilter();
    const nameOf = (id: number) => this.services().find((service) => service.id === id)?.name ?? '';

    return this.staff()
      .filter((member) => {
        const haystack = searchable(
          member.name,
          member.email,
          member.phone,
          member.specialization,
          ...member.services.map(nameOf),
        );
        if (!matches(haystack, term)) {
          return false;
        }
        if (status === 'active' && !member.is_active) {
          return false;
        }
        if (status === 'inactive' && member.is_active) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected setStatusFilter(value: string): void {
    this.statusFilter.set(value);
  }

  protected serviceLabel(id: number): string {
    return this.services().find((service) => service.id === id)?.name ?? `#${id}`;
  }

  /** Only active services are offered when creating a staff member. */
  protected readonly selectableServices = computed(() =>
    this.services().filter((service) => service.is_active),
  );

  /* --------------------------------- form ---------------------------------- */

  protected openForm(): void {
    this.form.reset({
      name: '',
      email: '',
      phone: '',
      specialization: '',
      is_active: true,
    });
    this.selectedServices.set(new Set());
    this.formError.set('');
    this.fieldErrors.set({});
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (!this.saving()) {
      this.formOpen.set(false);
    }
  }

  protected isSelected(id: number): boolean {
    return this.selectedServices().has(id);
  }

  protected toggleService(id: number, checked: boolean): void {
    this.selectedServices.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected toggleAllServices(checked: boolean): void {
    this.selectedServices.set(
      checked ? new Set(this.selectableServices().map((s) => s.id)) : new Set(),
    );
  }

  protected readonly allSelected = computed(() => {
    const selectable = this.selectableServices();
    return selectable.length > 0 && this.selectedServices().size === selectable.length;
  });

  protected readonly selectedCount = computed(() => this.selectedServices().size);

  protected fieldError(name: 'name' | 'email' | 'phone' | 'specialization'): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return name === 'name' ? 'Name is required.' : 'Email is required.';
    }
    if (control.hasError('email')) {
      return 'Enter a valid email address.';
    }
    if (control.hasError('maxlength')) {
      return `Keep this under ${control.getError('maxlength').requiredLength} characters.`;
    }
    return 'Please check this field.';
  }

  protected servicesError(): string {
    if (this.fieldErrors()['services']) {
      return this.fieldErrors()['services']!;
    }
    if (this.fieldErrors()['non_field_errors']) {
      return this.fieldErrors()['non_field_errors']!;
    }
    return '';
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const selected = [...this.selectedServices()];
    if (selected.length === 0) {
      this.formError.set('Select at least one service this person can perform.');
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set('');
    this.fieldErrors.set({});

    this.staffService
      .create({
        name: value.name,
        email: value.email,
        phone: value.phone,
        specialization: value.specialization,
        services: selected,
        is_active: value.is_active,
      })
      .subscribe({
        next: (member) => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.staff.update((list) => [...list, member]);
          this.toast.success(`“${member.name}” was added.`, 'Staff added');
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
          if (apiError.nonFieldErrors.length > 0) {
            mapped['non_field_errors'] = apiError.nonFieldErrors[0]!;
          }
          this.fieldErrors.set(mapped);
          this.formError.set(apiError.message);
        },
      });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly initials = initials;
}
