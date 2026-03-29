import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    // Bun 전역 + Bun 전용 모듈 모킹
    setupFiles: [resolve(__dirname, '__mocks__/bun-setup.ts')],
  },
  resolve: {
    alias: {
      // vitest(Node)에서 Bun 전용 모듈 모킹
      'bun:sqlite': resolve(__dirname, '__mocks__/bun-sqlite.ts'),
      'hono/bun': resolve(__dirname, '__mocks__/hono-bun.ts'),
    },
  },
})
