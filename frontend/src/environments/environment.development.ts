import type { Environment } from './environment.type';

/**
 * DEVELOPMENT environment — used by `ng serve` / `ng build --configuration development`
 * (wired up through `fileReplacements` in angular.json).
 *
 * `apiBaseUrl` is the *relative* path `/api`. The dev server forwards it to Django
 * using `proxy.conf.mjs`, so:
 *
 *   browser  ->  http://localhost:4200/api/services/
 *   proxy    ->  http://127.0.0.1:8000/api/services/
 *
 * Because the hop from proxy to Django is server-to-server, the browser never
 * makes a cross-origin request and CORS preflight is never involved.
 *
 * If you would rather call Django straight from the browser (using the
 * `http://localhost:4200` origin that Django already allows), change this to:
 *
 *   apiBaseUrl: 'http://127.0.0.1:8000/api'
 *
 * and serve Angular from `http://localhost:4200`.
 */
export const environment: Environment = {
  production: false,
  apiBaseUrl: '/api',
};
