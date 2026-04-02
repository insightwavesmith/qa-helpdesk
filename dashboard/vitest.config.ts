import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
  },
});
