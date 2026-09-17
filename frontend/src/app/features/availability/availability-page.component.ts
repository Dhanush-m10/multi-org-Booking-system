import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { AvailabilityService } from '../../core/services/availability.service';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import type { Staff, Weekday, WorkingHours } from '../../core/models/api.models';
import { apiErrorMessage, toApiError } from '../../core/utils/api-errors';
import { formatTime, toApiTime, WEEKDAY_LABELS } from '../../core/utils/datetime';
import { ButtonComponent } from '../../shared/components/button.component';
import { CardComponent } from '../../shared/components/card.component';
import { ErrorStateComponent } from '../../shared/components/error-state.component';
import { EmptyStateComponent } from '../../shared/components/state.component';
import { FieldComponent } from '../../shared/components/field.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

/**
 * Working hours.
 *
 *   GET|POST /api/working-hours/
 *
 * The week is always Monday..Sunday because `WorkingHours.WeekDay` numbers
 * Monday as 0. For each staff member the screen shows the seven days and
 * distinguishes three real states that come straight from the data:
 *
 *   - a row with `is_available: true`  -> "Available 09:00 – 17:00"
 *   - a row with `is_available: false` -> "Unavailable"
 *   - no row at all                    -> "Not set" (and therefore not bookable)
 *
 * Rows are read-only: the endpoint has no update or delete, and a second POST
 * for the same (staff, weekday) is rejected by the unique constraint. The UI
 * says so instead of offering a control that cannot work.
 */
interface DayRow {
  weekday: Weekday;
  label: string;
  hours: WorkingHours | null;
}

@Component({
  selector: 'app-availability-page',
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
    SkeletonComponent,
  ],
  templateUrl: './availability-page.component.html',
})
export class AvailabilityPageComponent {
  private readonly availability = inject(AvailabilityService);
  private readonly staffService = inject(StaffService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly workingHours = signal<WorkingHours[]>([]);

  /** Currently inspected staff member. */
  protected readonly selectedStaffId = signal<number | null>(null);

  /* -------------------------------- dialog -------------------------------- */

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly editingWeekday = signal<Weekday | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    start_time: ['09:00', [Validators.required]],
    end_time: ['17:00', [Validators.required]],
    is_available: [true],
  });

  protected readonly weekdayLabels = WEEKDAY_LABELS;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      staff: this.staffService.getAll(),
      workingHours: this.availability.getAll(),
    }).subscribe({
      next: ({ staff, workingHours }) => {
        this.staff.set(staff);
        this.workingHours.set(workingHours);

        // Keep the current selection if it still exists, otherwise pick the
        // first staff member so the week is never blank by default.
        const current = this.selectedStaffId();
        const stillExists = staff.some((member) => member.id === current);
        this.selectedStaffId.set(stillExists ? current : (staff[0]?.id ?? null));

        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected selectStaff(value: string): void {
    const id = Number(value);
    this.selectedStaffId.set(Number.isNaN(id) ? null : id);
  }

  protected readonly selectedStaff = computed(
    () => this.staff().find((member) => member.id === this.selectedStaffId()) ?? null,
  );

  /** The seven days for the selected staff member. */
  protected readonly week = computed<DayRow[]>(() => {
    const staffId = this.selectedStaffId();
    const forStaff = this.workingHours().filter((row) => row.staff === staffId);

    return (WEEKDAY_LABELS as readonly string[]).map((label, index) => ({
      weekday: index as Weekday,
      label,
      hours: forStaff.find((row) => row.weekday === index) ?? null,
    }));
  });

  protected readonly setDays = computed(
    () => this.week().filter((day) => day.hours !== null).length,
  );

  /* -------------------------------- dialog --------------------------------- */

  protected openForm(weekday: Weekday): void {
    this.editingWeekday.set(weekday);
    this.form.reset({ start_time: '09:00', end_time: '17:00', is_available: true });
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (!this.saving()) {
      this.formOpen.set(false);
    }
  }

  protected readonly dialogTitle = computed(() => {
    const weekday = this.editingWeekday();
    const staffName = this.selectedStaff()?.name ?? 'staff member';
    return weekday === null ? 'Set working hours' : `${WEEKDAY_LABELS[weekday]} · ${staffName}`;
  });

  /** Client-side check mirroring the backend's `start_time < end_time` rule. */
  protected timeError(): string {
    const { start_time: start, end_time: end } = this.form.getRawValue();
    if (!start || !end) {
      return 'Both times are required.';
    }
    if (start >= end) {
      return 'Start time must be before end time.';
    }
    return '';
  }

  protected onSubmit(): void {
    const weekday = this.editingWeekday();
    const staffId = this.selectedStaffId();

    if (weekday === null || staffId === null || this.saving()) {
      return;
    }
    if (this.form.invalid || this.timeError()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set('');

    this.availability
      .create({
        staff: staffId,
        weekday,
        start_time: toApiTime(value.start_time),
        end_time: toApiTime(value.end_time),
        is_available: value.is_available,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.workingHours.update((list) => [...list, created]);
          this.toast.success(`${WEEKDAY_LABELS[weekday]} hours saved.`, 'Availability updated');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const apiError = toApiError(err);
          // The unique constraint surfaces as non_field_errors; say it plainly.
          this.formError.set(
            apiError.message.includes('unique set')
              ? 'Hours already exist for this day. The API does not allow editing them.'
              : apiError.message,
          );
        },
      });
  }

  /* ------------------------------ view helpers ------------------------------ */

  protected readonly formatTime = formatTime;
}
