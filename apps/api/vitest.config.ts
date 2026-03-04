import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    include:  ['src/**/*.test.ts'],
    pool:     'forks',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/core/**/*.ts',
        'src/modules/**/*.ts',
      ],
    },
  },
})
