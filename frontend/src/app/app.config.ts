import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AppTitleStrategy } from './core/routing/app-title-strategy';

/**
 * Root configuration.
 *
 * Interceptor ORDER MATTERS. Responses travel back through the chain in reverse,
 * so listing `errorInterceptor` first means it observes an error only after
 * `authInterceptor` has already had its chance to refresh a 401 and retry.
 * A transparently-refreshed request therefore never produces a spurious toast.
 *
 * `provideZonelessChangeDetection()` — Angular 21 runs without zone.js, so all
 * UI state in this app is held in signals.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
