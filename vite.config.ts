import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Package version plus the git commit, e.g. "0.0.0+e3beae8" (shown in the app and links). */
function appVersion(): string {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  try {
    return `${version}+${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`;
  } catch {
    return version;
  }
}

export default defineConfig({
  // Relative asset URLs, so the static build works from any sub-path on the chair server.
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'cli/**/*.test.ts',
      'scripts/**/*.test.ts',
      'server/**/*.test.mjs',
    ],
  },
});
