import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    setupFiles: ['reflect-metadata'],
    include: ['src/tests/**/*.test.ts'],
  },
})
