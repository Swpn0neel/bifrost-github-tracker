function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// Getters are lazy so importing this module never throws at build time.
export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get githubToken(): string | undefined {
    return process.env.GITHUB_TOKEN || undefined;
  },
  get repo(): string {
    return process.env.GITHUB_REPO || "maximhq/bifrost";
  },
  get collectSecret(): string | undefined {
    return process.env.COLLECT_SECRET || undefined;
  },
  // Sign-in goes through the GTM Hub (see src/lib/auth.ts). All optional; the defaults are production.
  get hubUrl(): string {
    return (process.env.HUB_URL || "https://hub.agitracker.io").replace(/\/+$/, "");
  },
  get appPublicUrl(): string {
    return (process.env.APP_PUBLIC_URL || "https://github.agitracker.io").replace(/\/+$/, "");
  },
  get hubAppSlug(): string {
    return process.env.HUB_APP_SLUG || "github-tracker";
  },
  /** Local development only: skip the hub and treat every request as a local admin. */
  get hubSsoDisabled(): boolean {
    return process.env.HUB_SSO_DISABLED === "true";
  },
};
