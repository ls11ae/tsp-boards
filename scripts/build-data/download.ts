// Downloads the raw sources for one country into data/raw/ and records URL, time, size and
// SHA-256 in data/raw/downloads.json.
// Usage: npm run data:download -- de [--force]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DOWNLOADS_MANIFEST,
  RAW_DIR,
  sourcesForCountry,
  type DownloadRecord,
  type DownloadsManifest,
  type RawSource,
} from './sources';
import { WIKIDATA_SITELINKS, downloadSitelinks } from './fame';
import { WORLD, worldNameSources, worldTownLinks } from './world';

async function readManifest(): Promise<DownloadsManifest> {
  if (!existsSync(DOWNLOADS_MANIFEST)) return {};
  return JSON.parse(await readFile(DOWNLOADS_MANIFEST, 'utf8')) as DownloadsManifest;
}

async function download(source: RawSource): Promise<DownloadRecord> {
  const target = path.join(RAW_DIR, source.file);
  await mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(target, bytes);
  return {
    key: source.key,
    url: source.url,
    file: source.file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    downloadedAt: new Date().toISOString(),
    lastModified: response.headers.get('last-modified'),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const country = args.find((a) => !a.startsWith('--'));
  if (!country) throw new Error('Usage: data:download -- <country code> [--force]');

  const manifest = await readManifest();
  const fetchAll = async (sources: readonly RawSource[]) => {
    for (const source of sources) {
      const target = path.join(RAW_DIR, source.file);
      if (!force && existsSync(target) && manifest[source.key]) {
        console.log(`skip ${source.file} (already downloaded; --force to refresh)`);
        continue;
      }
      console.log(`download ${source.url}`);
      const record = await download(source);
      manifest[source.key] = record;
      console.log(`  ${(record.bytes / 1e6).toFixed(1)} MB, sha256 ${record.sha256.slice(0, 12)}…`);
      await writeFile(DOWNLOADS_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    }
  };
  await fetchAll(sourcesForCountry(country));
  if (country.toUpperCase() !== WORLD.code) return;
  // The world's name files and sitelinks follow from its town list (downloaded above).
  await fetchAll(await worldNameSources());
  const sitelinks = path.join(RAW_DIR, WIKIDATA_SITELINKS.file);
  if (!force && existsSync(sitelinks) && manifest[WIKIDATA_SITELINKS.key]) {
    console.log(`skip ${WIKIDATA_SITELINKS.file} (already downloaded; --force to refresh)`);
    return;
  }
  console.log(`query ${WIKIDATA_SITELINKS.url} (sitelinks by GeoNames id)`);
  manifest[WIKIDATA_SITELINKS.key] = await downloadSitelinks(await worldTownLinks());
  await writeFile(DOWNLOADS_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
