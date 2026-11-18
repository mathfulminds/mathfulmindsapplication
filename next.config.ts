import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The default Vercel URL forwards to the real domain (308, path and
      // query string kept), so the site only ever lives at mathfulminds.com.
      {
        source: "/:path*",
        has: [{ type: "host", value: "mathfulmindsapplication-main.vercel.app" }],
        destination: "https://mathfulminds.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
