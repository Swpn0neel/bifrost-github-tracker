import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg uses Node-only APIs; keep it out of the bundler.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
