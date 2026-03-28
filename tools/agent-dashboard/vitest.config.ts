import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // vitest(Node)에서 Bun 전용 모듈 모킹
      'bun:sqlite': resolve(__dirname, '__mocks__/bun-sqlite.ts'),
    },
  },
})
