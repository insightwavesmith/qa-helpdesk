import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react', 'recharts', '@tiptap/react', '@tiptap/starter-kit',
      '@tiptap/extension-color', '@tiptap/extension-image', '@tiptap/extension-link',
      '@tiptap/extension-placeholder', '@tiptap/extension-text-align',
      '@tiptap/extension-text-style', '@tiptap/extension-underline',
      '@tiptap/pm', 'framer-motion', 'motion', 'radix-ui', '@tanstack/react-table',
      '@react-email/components', 'react-email'
    ],
  },
};

export default nextConfig;
