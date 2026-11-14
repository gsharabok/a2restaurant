import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Lets the dev server be opened through a Devin preview link.
  allowedDevOrigins: ["*.preview.devinapps.com"],
  // Starbucks UK product photos are loaded from its own media library, resized by Next.
  images: { remotePatterns: [{ protocol: "https", hostname: "www.digitalassets.starbucks.eu", pathname: "/sites/starbucks-medialibrary/files/**" }] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
