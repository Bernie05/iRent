import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/services/**', 'src/middleware/**', 'src/emails/**', 'src/routes/**', 'src/config.js', 'src/app.js'],
      exclude: ['src/lib/database.types.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
});
