import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment:      'node',
    include:          ['src/**/*.test.{ts,tsx}'],
    passWithNoTests:  true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['src/**/*.{ts,tsx}'],
      exclude: ['src/pages/**', 'src/layouts/**', 'src/main.tsx', 'src/router.tsx', 'src/providers.tsx'],
    },
  },
})
