import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/bscamp-storage/**",
      },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
    optimizePackageImports: ["lucide-react", "recharts", "@tiptap/react"],
  },
};

export default nextConfig;
