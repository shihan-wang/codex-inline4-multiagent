import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['artifacts/v3/phase1/qa/*.audit.ts'],
  },
});
