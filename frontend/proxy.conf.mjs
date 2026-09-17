/**
 * Dev-server proxy for `ng serve`.
 *
 * Every request the app makes to `/api/...` is forwarded to the local Django
 * server. This keeps a single API base URL (`/api`) in the Angular code for
 * both development and production, and it sidesteps CORS entirely because the
 * browser only ever talks to the Angular dev server.
 *
 * Django target:  python manage.py runserver  ->  http://127.0.0.1:8000
 */
export default [
  {
    context: ['/api'],
    target: 'http://127.0.0.1:8000',
    secure: false,
    changeOrigin: true,
  },
];
