/**
 * Shape of an environment file.
 *
 * This lives in its own module on purpose. `angular.json` swaps
 * `environment.ts` for `environment.development.ts` during a development build,
 * so if the interface lived in `environment.ts`, the development file would end
 * up importing the type from *itself* and the build would fail.
 */
export interface Environment {
  production: boolean;
  /** Base URL every API call is prefixed with. No trailing slash. */
  apiBaseUrl: string;
}
