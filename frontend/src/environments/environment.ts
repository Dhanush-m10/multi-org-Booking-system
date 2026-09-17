/**
 * PRODUCTION environment.
 *
 * This file is the one used by `ng build` (the `production` configuration).
 * `angular.json` swaps it out for `environment.development.ts` when you run
 * `ng serve`, so nothing in this file ever leaks into your local dev build.
 *
 * ---------------------------------------------------------------------
 * POINTING AT YOUR DEPLOYED DJANGO BACKEND
 * ---------------------------------------------------------------------
 * Two supported strategies — pick ONE:
 *
 *  1. Same-origin reverse proxy (recommended, no CORS needed)
 *     Leave `apiBaseUrl` as `'/api'` and keep the `/api/(.*)` rewrite in
 *     `vercel.json` pointing at your Django host. The browser only ever
 *     talks to the Vercel domain.
 *
 *  2. Direct cross-origin calls
 *     Set `apiBaseUrl` to the absolute URL, e.g.
 *       apiBaseUrl: 'https://booking-api.example.com/api'
 *     and make sure that origin is listed in Django's CORS_ALLOWED_ORIGINS.
 * ---------------------------------------------------------------------
 */
import type { Environment } from './environment.type';

export const environment: Environment = {
  production: true,
  apiBaseUrl: '/api',
};
