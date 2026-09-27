import { env } from "./lib/env";

// Runs once when the Next server starts (not in the collector).
export function register() {
  if (env.hubSsoDisabled) {
    console.warn("[auth] HUB_SSO_DISABLED=true: the GTM Hub sign-in is OFF and every request is treated as dev@localhost (admin). Local development only.");
  }
}
