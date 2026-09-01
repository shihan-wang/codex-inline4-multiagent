import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['artifacts/v3/final-review/mechanics/mechanical-probe.test.ts'],
    reporters: ['verbose'],
  },
});
