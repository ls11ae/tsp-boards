import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const LICENSES_FILE = 'third-party-licenses.txt';

/**
 * License texts of the packages the app bundles (MIT and ISC ask for their notices with every
 * copy) and of the board font, whose outlines the app carries (SIL OFL 1.1).
 */
function licensesText(): string {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const deps = read(`node_modules/${name}/package.json`).dependencies ?? {};
    for (const dep of Object.keys(deps)) visit(dep);
  };
  for (const dep of Object.keys(read('package.json').dependencies ?? {})) visit(dep);
  const section = (name: string) => {
    const pkg = read(`node_modules/${name}/package.json`);
    const file = readdirSync(`node_modules/${name}`).find((f) => /^licen[cs]e/i.test(f));
    const text = file ? readFileSync(`node_modules/${name}/${file}`, 'utf8').trim() : '';
    return `${name} ${String(pkg.version)} (${String(pkg.license)})\n\n${text}`;
  };
  const header = [
    'TSP Boards: third-party software and data',
    '',
    'City data: GeoNames (geonames.org), CC BY 4.0. Borders: Natural Earth, public domain.',
    'Fame of world cities and themed lists: Wikidata, CC0.',
  ].join('\n');
  const sections = [...[...seen].sort(), '@fontsource/fira-sans-condensed'].map(section);
  return [header, ...sections].join(`\n\n${'-'.repeat(78)}\n\n`) + '\n';
}

function thirdPartyLicenses(): Plugin {
  return {
    name: 'third-party-licenses',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source: licensesText() });
    },
    configureServer(server) {
      server.middlewares.use(`/${LICENSES_FILE}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(licensesText());
      });
    },
  };
}

/** Package version plus the git commit, e.g. "0.0.0+e3beae8" (shown in the app and links). */
function appVersion(): string {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  try {
    return `${version}+${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`;
  } catch {
    return version;
  }
}

export default defineConfig(({ command }) => ({
  // Relative asset URLs, so the static build works from any sub-path on the chair server.
  base: './',
  // HiGHS imports node:module only when it runs in Node; the browser build gets a stub (tests
  // and the CLI run in Node and keep the real module).
  resolve:
    command === 'build'
      ? {
          alias: {
            'node:module': fileURLToPath(
              new URL('./src/workers/node-module-stub.ts', import.meta.url),
            ),
          },
        }
      : {},
  plugins: [react(), thirdPartyLicenses()],
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
}));
