/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig gives unit tests the same Vite setup as Astro
// (import.meta.env, aliases) and enables Astro Container API tests later.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
