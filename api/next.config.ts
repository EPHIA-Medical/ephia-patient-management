import type { NextConfig } from "next";

// API-only service: no pages beyond a one-line root, no images, no i18n.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
