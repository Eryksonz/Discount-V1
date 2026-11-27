import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Retail product imagery is hotlinked only (never stored locally)
    unoptimized: true,
  },
};

export default nextConfig;
