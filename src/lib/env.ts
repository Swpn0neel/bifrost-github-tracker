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
  get dashboardPassword(): string {
    return required("DASHBOARD_PASSWORD");
  },
  get sessionSecret(): string {
    return process.env.SESSION_SECRET || required("DASHBOARD_PASSWORD");
  },
  get collectSecret(): string | undefined {
    return process.env.COLLECT_SECRET || undefined;
  },
};
