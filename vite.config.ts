import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs, so the static build works from any sub-path on the chair server.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'cli/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
