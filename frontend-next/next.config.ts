import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Diperlukan untuk deploy Next.js di Docker / Cloud Run
  output: "standalone",

  // Proxy semua request /api/* ke backend Cloud Run
  // BACKEND_URL diset sebagai env var di Cloud Run (runtime, bukan build-time)
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_URL || "http://localhost:8080";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
