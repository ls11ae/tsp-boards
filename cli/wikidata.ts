// Builds curated place lists from Wikidata (CC0) for the collection (Phase 6): city districts
// as custom places with coordinates, and themed lists of towns matched to the country data
// (by Wikidata id, else by name within 15 km; otherwise kept as a custom place).
// Usage: npx tsx cli/wikidata.ts <list> [<list> …]   (writes docs/data/curated/<list>.txt)
// Lists: see LISTS below.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { citiesFromColumns, type City } from '../src/core/data';
import { NameIndex } from '../src/core/places';
import { geodesicKm } from '../src/core/projection';
import { loadCountry } from './lib/country';

interface ListSpec {
  readonly description: string;
  /** 'coords': custom places; 'towns': towns of the country data. */
  readonly kind: 'coords' | 'towns';
  /** SPARQL query binding ?o, ?oLabel and ?c (WKT point). */
  readonly query: string;
  /** Removed from the start of names (e.g. "Berlin-"). */
  readonly strip?: RegExp;
}

const label = (vars: string) =>
  `SERVICE wikibase:label { bd:serviceParam wikibase:language "de". ${vars} }`;

const LISTS: Readonly<Record<string, ListSpec>> = {
  'berlin-ortsteile': {
    description: 'Ortsteile of Berlin (class Q35034452 "Ortsteil von Berlin", not dissolved)',
    kind: 'coords',
    query: `SELECT ?o ?oLabel (SAMPLE(?coord) AS ?c) WHERE {
      ?o wdt:P31 wd:Q35034452 . FILTER NOT EXISTS { ?o wdt:P576 ?end }
      ?o wdt:P625 ?coord . ${label('?o rdfs:label ?oLabel .')}
    } GROUP BY ?o ?oLabel`,
    strip: /^Berlin-/,
  },
  'hamburg-stadtteile': {
    description: 'Stadtteile of Hamburg (parts of the seven Bezirke, P150)',
    kind: 'coords',
    query: `SELECT ?o ?oLabel (SAMPLE(?coord) AS ?c) WHERE {
      wd:Q1055 wdt:P150 ?b . ?b wdt:P150 ?o .
      ?o wdt:P625 ?coord . ${label('?o rdfs:label ?oLabel .')}
    } GROUP BY ?o ?oLabel`,
    strip: /^Hamburg-/,
  },
};

const ENDPOINT = 'https://query.wikidata.org/sparql';
const OUT = path.resolve(import.meta.dirname, '../docs/data/curated');

interface Row {
  readonly qid: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

async function query(sparql: string): Promise<Row[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'tsp-boards-build/0.1 (TU Dortmund, Chair 11; curated puzzle lists)',
    },
  });
  if (!response.ok) throw new Error(`Wikidata: HTTP ${response.status}`);
  const json = (await response.json()) as {
    results: { bindings: Record<string, { value: string } | undefined>[] };
  };
  return json.results.bindings.flatMap((b): Row[] => {
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c?.value ?? '');
    if (!point || !b.o || !b.oLabel) return [];
    return [
      {
        qid: b.o.value.split('/').pop()!,
        name: b.oLabel.value,
        lon: Number(point[1]),
        lat: Number(point[2]),
      },
    ];
  });
}

function townFor(row: Row, byQid: Map<string, City>, names: NameIndex): City | null {
  const exact = byQid.get(row.qid);
  if (exact) return exact;
  const match = names.match(row.name);
  if (match.kind !== 'exact') return null;
  const near = match.options
    .map((c) => ({ c, km: geodesicKm([c.lon, c.lat], [row.lon, row.lat]) }))
    .filter((x) => x.km < 15)
    .sort((a, b) => a.km - b.km)[0];
  return near?.c ?? null;
}

const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error(`lists: ${Object.keys(LISTS).join(', ')}`);
const file = loadCountry('de');
const towns = citiesFromColumns(file.cities, file.states);
const byQid = new Map(towns.flatMap((c) => (c.wikidata ? [[c.wikidata, c] as const] : [])));
const names = new NameIndex(towns);
const today = new Date().toISOString().slice(0, 10);

for (const id of ids) {
  const spec = LISTS[id];
  if (!spec) throw new Error(`unknown list ${id}`);
  const rows = await query(spec.query);
  const clean = (name: string) => (spec.strip ? name.replace(spec.strip, '') : name);
  const lines = rows
    .map((r) => {
      if (spec.kind === 'towns') {
        const town = townFor(r, byQid, names);
        if (town) return { sort: town.name, line: town.name };
      }
      const name = clean(r.name);
      return { sort: name, line: `${name}; ${r.lat.toFixed(5)}; ${r.lon.toFixed(5)}` };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort, 'de'));
  const unique = [...new Set(lines.map((l) => l.line))];
  const header = [
    `# ${spec.description}: ${unique.length} places.`,
    `# Source: Wikidata (CC0), query service ${ENDPOINT}, retrieved ${today}.`,
    `# Built with: npx tsx cli/wikidata.ts ${id}`,
    `# Query: ${spec.query.replace(/\s+/g, ' ').trim()}`,
  ];
  writeFileSync(path.join(OUT, `${id}.txt`), `${[...header, ...unique].join('\n')}\n`);
  console.error(`${id}: ${unique.length} places (${rows.length} rows)`);
}
