import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Retail product imagery is hotlinked only (never stored locally)
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.shopify.com" },
      { protocol: "https", hostname: "fahertybrand.com" },
      { protocol: "https", hostname: "**.fahertybrand.com" },
      { protocol: "https", hostname: "bonobos.com" },
      { protocol: "https", hostname: "**.bonobos.com" },
      { protocol: "https", hostname: "**.bonobos.imgix.net" },
      { protocol: "https", hostname: "**.petermillar.com" },
      { protocol: "https", hostname: "**.vineyardvines.com" },
      { protocol: "https", hostname: "**.brooksbrothers.com" },
      { protocol: "https", hostname: "**.bynder.com" },
      { protocol: "https", hostname: "**.johnnie-o.com" },
      { protocol: "https", hostname: "**.mizzenandmain.com" },
      { protocol: "https", hostname: "**.rhone.com" },
      { protocol: "https", hostname: "**.ralphlauren.com" },
      { protocol: "https", hostname: "**.jcrew.com" },
      { protocol: "https", hostname: "**.charlestyrwhitt.com" },
      { protocol: "https", hostname: "**.gap.com" },
      { protocol: "https", hostname: "**.toddsnyder.com" },
      { protocol: "https", hostname: "**.suitsupply.com" },
      { protocol: "https", hostname: "**.spierandmackay.com" },
      { protocol: "https", hostname: "**.publicrec.com" },
    ],
  },
};

export default nextConfig;
