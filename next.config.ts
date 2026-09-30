import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg uses Node-only APIs; keep it out of the bundler.
  serverExternalPackages: ["pg"],
  // Pages renamed on 30 Sep 2026; old links and bookmarks still land (query strings carry over).
  async redirects() {
    return [
      { source: "/quarters", destination: "/time-of-day", permanent: false },
      { source: "/daily", destination: "/history", permanent: false },
      { source: "/activity", destination: "/commits", permanent: false },
    ];
  },
};

export default nextConfig;
