import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['artifacts/**', 'dist/**', 'node_modules/**'],
  },
});
