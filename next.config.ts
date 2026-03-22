import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "symvlrsmkjlztoopbnht.supabase.co",
        pathname: "/storage/v1/object/public/**",
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
