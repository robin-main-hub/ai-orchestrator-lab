/**
 * Pure Mimo proxy configuration constants.
 *
 * No runtime imports, no side effects, no secrets.
 * Both Vite config and the proxy implementation import from here.
 * Future credential migration changes this file, not route logic.
 */

export const MIMO_CREDENTIAL_ENV = "MIMO_TP_API_KEY";
export const MIMO_UPSTREAM = "https://token-plan-sgp.xiaomimimo.com";
