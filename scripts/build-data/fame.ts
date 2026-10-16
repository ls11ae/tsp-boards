// Fame of the world's towns (roadmap 9.6): the number of Wikipedia language editions with an
// article about the town (Wikidata sitelinks). The item is the one GeoNames links (its 'wkdt'
// alternate name, or an override), the one about a Wikipedia article GeoNames links (its
// 'link' alternate names), or one that names the town's GeoNames id (P1566), whichever has the
// most sitelinks: P1566 often sits on a district or municipality item (Madrid's GeoNames id on
// an item without any article), and GeoNames links no item for many towns (München, Recife).
// Population says little about how well-known a city is worldwide (Chongqing has 22 million
// inhabitants, Paris 2 million); the number of Wikipedias does (Paris 366, Chongqing 153).
// Downloaded once into data/raw/ (git-ignored) like the other raw sources; Wikidata is CC0.

import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, type DownloadRecord, type RawSource } from './sources';

const ENDPOINT = 'https://query.wikidata.org/sparql';

export const WIKIDATA_SITELINKS: RawSource = {
  key: 'wikidata/wo-sitelinks',
  url: ENDPOINT,
  file: 'wikidata/wo-sitelinks.json',
};

/** GeoNames ids or QIDs per query (the query goes in the body of a POST request). */
const BATCH = 400;

interface SparqlRow {
  readonly geonames?: { readonly value: string };
  readonly article?: { readonly value: string };
  readonly item: { readonly value: string };
  readonly links: { readonly value: string };
}

/** GeoNames id -> [Wikidata QID, sitelinks], the item with the most sitelinks per id. */
export type Sitelinks = Map<number, readonly [string, number]>;

export function sitelinksQuery(ids: readonly number[]): string {
  return [
    'SELECT ?geonames ?item ?links WHERE {',
    `  VALUES ?geonames { ${ids.map((id) => `"${id}"`).join(' ')} }`,
    '  ?item wdt:P1566 ?geonames ; wikibase:sitelinks ?links .',
    '}',
  ].join('\n');
}

export function itemsQuery(qids: readonly string[]): string {
  return [
    'SELECT ?item ?links WHERE {',
    `  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} }`,
    '  ?item wikibase:sitelinks ?links .',
    '}',
  ].join('\n');
}

export function articlesQuery(articles: readonly string[]): string {
  return [
    'SELECT ?article ?item ?links WHERE {',
    `  VALUES ?article { ${articles.map((a) => `<${a}>`).join(' ')} }`,
    '  ?article schema:about ?item . ?item wikibase:sitelinks ?links .',
    '}',
  ].join('\n');
}

/** Keeps the item with the most sitelinks per town (ties: the smaller QID). */
function keep(into: Sitelinks, id: number, qid: string, links: number): void {
  const known = into.get(id);
  const order = (q: string) => Number(q.slice(1));
  if (!known || links > known[1] || (links === known[1] && order(qid) < order(known[0]))) {
    into.set(id, [qid, links]);
  }
}

/**
 * Adds the rows of a query result: by GeoNames id (rows with ?geonames), else the towns that
 * link the row's article or item (`towns`, keyed by article URL or QID).
 */
export function addSitelinks(
  into: Sitelinks,
  rows: readonly SparqlRow[],
  towns: ReadonlyMap<string, readonly number[]> = new Map(),
): void {
  for (const row of rows) {
    const qid = row.item.value.split('/').pop()!;
    const links = Number(row.links.value);
    const ids = row.geonames
      ? [Number(row.geonames.value)]
      : (towns.get(row.article?.value ?? qid) ?? []);
    for (const id of ids) keep(into, id, qid, links);
  }
}

/** Wikipedia article URL in the form Wikidata uses (https). */
export function articleUrl(link: string): string | null {
  const m = /^https?:\/\/([a-z-]+\.wikipedia\.org\/wiki\/.+)$/.exec(link.trim());
  return m ? `https://${m[1]}` : null;
}

/** A town with the Wikidata item and Wikipedia articles GeoNames links. */
export interface TownLinks {
  readonly id: number;
  readonly wikidata: string | null;
  readonly articles: readonly string[];
}

async function query(sparql: string): Promise<SparqlRow[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'tsp-boards-build/0.1 (TU Dortmund, Chair 11; data build)',
    },
    body: `query=${encodeURIComponent(sparql)}`,
  });
  if (!response.ok) throw new Error(`${ENDPOINT}: HTTP ${response.status}`);
  const json = (await response.json()) as { results: { bindings: SparqlRow[] } };
  return json.results.bindings;
}

/** Queries the sitelinks of the towns and writes them to data/raw/ (sorted by id). */
export async function downloadSitelinks(towns: readonly TownLinks[]): Promise<DownloadRecord> {
  const sitelinks: Sitelinks = new Map();
  const ids = towns.map((t) => t.id);
  for (let i = 0; i < ids.length; i += BATCH) {
    addSitelinks(sitelinks, await query(sitelinksQuery(ids.slice(i, i + BATCH))));
  }
  const byKey = new Map<string, number[]>();
  const add = (key: string, id: number) => byKey.set(key, [...(byKey.get(key) ?? []), id]);
  for (const t of towns) {
    if (t.wikidata) add(t.wikidata, t.id);
    for (const a of t.articles) add(a, t.id);
  }
  const qids = [...byKey.keys()].filter((k) => !k.startsWith('https://'));
  for (let i = 0; i < qids.length; i += BATCH) {
    addSitelinks(sitelinks, await query(itemsQuery(qids.slice(i, i + BATCH))), byKey);
  }
  const articles = [...byKey.keys()].filter((k) => k.startsWith('https://'));
  for (let i = 0; i < articles.length; i += BATCH) {
    addSitelinks(sitelinks, await query(articlesQuery(articles.slice(i, i + BATCH))), byKey);
  }
  const items = Object.fromEntries([...sitelinks].sort((a, b) => a[0] - b[0]));
  const by = 'P1566, linked QID and linked Wikipedia articles';
  const text = JSON.stringify({ endpoint: ENDPOINT, by, items }) + '\n';
  const target = path.join(RAW_DIR, WIKIDATA_SITELINKS.file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
  const bytes = new TextEncoder().encode(text);
  return {
    key: WIKIDATA_SITELINKS.key,
    url: ENDPOINT,
    file: WIKIDATA_SITELINKS.file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    downloadedAt: new Date().toISOString(),
    lastModified: null,
  };
}

export async function readSitelinks(): Promise<Sitelinks> {
  const json = JSON.parse(await readFile(path.join(RAW_DIR, WIKIDATA_SITELINKS.file), 'utf8')) as {
    items: Record<string, [string, number]>;
  };
  return new Map(Object.entries(json.items).map(([id, v]) => [Number(id), v]));
}
