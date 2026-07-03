import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // SOP uploads travel through a server action; the Next default is 1 MB,
      // which silently breaks any real Word file. Matches the 25 MB app-level
      // cap with headroom for multipart overhead.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
