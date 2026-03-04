import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    setupFiles: ['reflect-metadata'],
    include: ['src/tests/**/*.test.ts'],
  },
})
