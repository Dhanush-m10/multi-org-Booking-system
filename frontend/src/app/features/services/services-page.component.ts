import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { CatalogService } from '../../core/services/catalog.service';
import { ToastService } from '../../core/services/toast.service';
import type { Service, ServiceCategory } from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import { formatDuration, formatPrice } from '../../core/utils/datetime';
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
 * Services and service categories.
 *
 *   GET|POST /api/categories/
 *   GET|POST /api/services/
 *
 * Both endpoints are list + create only. There is no detail route, so editing,
 * deactivating or deleting a service is not possible through the API — the UI
 * therefore offers no such buttons rather than controls that would 404.
 *
 * `organization` is never sent: `ServiceSerializer` marks it read-only and the
 * view injects it from the authenticated user.
 */
@Component({
  selector: 'app-services-page',
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
  templateUrl: './services-page.component.html',
})
export class ServicesPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly services = signal<Service[]>([]);
  protected readonly categories = signal<ServiceCategory[]>([]);

  protected readonly search = signal('');
  protected readonly categoryFilter = signal<string>('all');
  protected readonly statusFilter = signal<string>('all');

  /* ------------------------------- dialogs -------------------------------- */

  protected readonly serviceFormOpen = signal(false);
  protected readonly categoryFormOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly serviceForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    category: [null as number | null, [Validators.required]],
    duration_minutes: [
      null as number | null,
      [Validators.required, Validators.min(1), Validators.max(1440)],
    ],
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    is_active: [true],
  });

  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
  });

  constructor() {
    this.load();
    if (this.route.snapshot.queryParamMap.get('create') === '1') {
      this.openServiceForm();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      services: this.catalog.getServices(),
      categories: this.catalog.getCategories(),
    }).subscribe({
      next: ({ services, categories }) => {
        this.services.set(services);
        this.categories.set(categories);
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
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const categoryName = (id: number) => this.categories().find((c) => c.id === id)?.name ?? '';

    return this.services()
      .filter((service) => {
        if (
          !matches(
            searchable(service.name, service.description, categoryName(service.category)),
            term,
          )
        ) {
          return false;
        }
        if (category !== 'all' && service.category !== Number(category)) {
          return false;
        }
        if (status === 'active' && !service.is_active) {
          return false;
        }
        if (status === 'inactive' && service.is_active) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** How many services sit in each category (shown in the category dialog). */
  protected readonly categoryCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const service of this.services()) {
      counts.set(service.category, (counts.get(service.category) ?? 0) + 1);
    }
    return counts;
  });

  protected categoryLabel(id: number): string {
    return this.categories().find((category) => category.id === id)?.name ?? '—';
  }

  protected setCategoryFilter(value: string): void {
    this.categoryFilter.set(value);
  }

  protected setStatusFilter(value: string): void {
    this.statusFilter.set(value);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.categoryFilter.set('all');
    this.statusFilter.set('all');
  }

  protected readonly hasFilters = computed(
    () => this.search() !== '' || this.categoryFilter() !== 'all' || this.statusFilter() !== 'all',
  );

  /* ------------------------------ service form ----------------------------- */

  protected openServiceForm(): void {
    this.serviceForm.reset({
      name: '',
      description: '',
      category: this.categories()[0]?.id ?? null,
      duration_minutes: null,
      price: null,
      is_active: true,
    });
    this.formError.set('');
    this.fieldErrors.set({});
    this.serviceFormOpen.set(true);
  }

  protected closeServiceForm(): void {
    if (!this.saving()) {
      this.serviceFormOpen.set(false);
    }
  }

  protected serviceFieldError(
    name: 'name' | 'description' | 'category' | 'duration_minutes' | 'price',
  ): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }
    const control = this.serviceForm.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return (
        {
          name: 'Service name is required.',
          category: 'Choose a category.',
          duration_minutes: 'Duration is required.',
          price: 'Price is required.',
        }[name as 'name' | 'category' | 'duration_minutes' | 'price'] ?? 'This field is required.'
      );
    }
    if (control.hasError('min')) {
      return name === 'price' ? 'Price cannot be negative.' : 'Duration must be at least 1 minute.';
    }
    if (control.hasError('max')) {
      return 'Duration cannot exceed 1440 minutes.';
    }
    if (control.hasError('maxlength')) {
      return `Keep this under ${control.getError('maxlength').requiredLength} characters.`;
    }
    return 'Please check this field.';
  }

  protected submitService(): void {
    if (this.serviceForm.invalid || this.saving()) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const value = this.serviceForm.getRawValue();
    this.saving.set(true);
    this.formError.set('');
    this.fieldErrors.set({});

    this.catalog
      .createService({
        name: value.name,
        description: value.description,
        category: value.category,
        duration_minutes: value.duration_minutes,
        // DecimalField expects a number or numeric string; send a fixed string
        // so 15 becomes "15.00" exactly as the serializer round-trips it.
        price: (value.price ?? 0).toFixed(2),
        is_active: value.is_active,
      })
      .subscribe({
        next: (service) => {
          this.saving.set(false);
          this.serviceFormOpen.set(false);
          this.services.update((list) => [...list, service]);
          this.toast.success(`“${service.name}” was added.`, 'Service created');
        },
        error: (err: unknown) => this.handleFormError(err),
      });
  }

  /* ----------------------------- category form ---------------------------- */

  protected openCategoryForm(): void {
    this.categoryForm.reset({ name: '', description: '' });
    this.formError.set('');
    this.fieldErrors.set({});
    this.categoryFormOpen.set(true);
  }

  protected closeCategoryForm(): void {
    if (!this.saving()) {
      this.categoryFormOpen.set(false);
    }
  }

  protected categoryFieldError(name: 'name' | 'description'): string {
    const backend = this.fieldErrors()[name];
    if (backend) {
      return backend;
    }
    const control = this.categoryForm.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return 'Category name is required.';
    }
    if (control.hasError('maxlength')) {
      return `Keep this under ${control.getError('maxlength').requiredLength} characters.`;
    }
    return 'Please check this field.';
  }

  protected submitCategory(): void {
    if (this.categoryForm.invalid || this.saving()) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.fieldErrors.set({});

    this.catalog.createCategory(this.categoryForm.getRawValue()).subscribe({
      next: (category) => {
        this.saving.set(false);
        this.categoryFormOpen.set(false);
        this.categories.update((list) => [...list, category]);
        this.toast.success(`Category “${category.name}” was added.`, 'Category created');
      },
      error: (err: unknown) => this.handleFormError(err),
    });
  }

  /** Shared DRF error mapping for both dialogs. */
  private handleFormError(err: unknown): void {
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
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly formatDuration = formatDuration;
  protected readonly formatPrice = formatPrice;
}
