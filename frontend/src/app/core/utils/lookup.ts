import type { Customer, Service, Staff } from '../models/api.models';

/**
 * Small lookup helpers.
 *
 * The API returns related objects as integer ids, so every screen that needs a
 * name has to join the id against the list it already fetched. These helpers
 * keep that join in one place instead of scattering `.find()` calls through
 * templates (which would also be O(n) per row).
 */

export type Indexed<T> = Map<number, T>;

export function indexById<T extends { id: number }>(items: T[]): Indexed<T> {
  return new Map(items.map((item) => [item.id, item]));
}

/** Human name for a customer id, with a safe fallback. */
export function customerName(index: Indexed<Customer>, id: number): string {
  return index.get(id)?.name ?? `Customer #${id}`;
}

export function staffName(index: Indexed<Staff>, id: number): string {
  return index.get(id)?.name ?? `Staff #${id}`;
}

export function serviceName(index: Indexed<Service>, id: number): string {
  return index.get(id)?.name ?? `Service #${id}`;
}

/** Case-insensitive "does this row match the search term?" helper. */
export function matches(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/** Join the non-empty parts of a record into one searchable string. */
export function searchable(...parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== null && part !== undefined).join(' ');
}
