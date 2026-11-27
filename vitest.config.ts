import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'rules', include: ['src/**/*.test.ts'], exclude: ['src/balance/**'] } },
      { test: { name: 'balance', include: ['src/balance/**/*.test.ts'] } },
    ],
  },
});
