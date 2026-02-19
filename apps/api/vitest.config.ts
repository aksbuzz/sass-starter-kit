import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    include:  ['src/**/*.test.ts'],
    pool:     'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts', 'src/worker/job-worker.ts'],
    },
  },
})
