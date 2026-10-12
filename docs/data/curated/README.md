# Curated place lists

Inputs of the curated fixed instances in `public/puzzles/` (built with
`npx tsx cli/collection.ts list --file docs/data/curated/<name>.txt --id <name> --title …`).
One place per line (town names of the country data); lines starting with `#` are comments.

| list                              | puzzle                                         | places | purpose |
| --------------------------------- | ---------------------------------------------- | ------ | ------- |
| `exzellenzuniversitaeten-2027.txt` | Universities of Excellence and alliances, 2027–2033 | 17 cities | digital (string gap 0.37 mm) |
| `exzellenzuniversitaeten-2019.txt` | Universities of Excellence and alliance, 2019–2026 | 10 cities | board (string gap 15.5 mm) |
| `exzellenzcluster-2026.txt`        | Clusters of Excellence, 2026–2032 (70 clusters) | 37 cities | digital (string gap 2.1 mm) |

Sources (retrieved 2026-10-12; details, universities, cluster names and coordinates in
`excellence-strategy-2026-10-12.json`):

- Clusters of Excellence, full list (German / English), DFG and Wissenschaftsrat, 22 May 2025:
  <https://www.dfg.de/resource/blob/357306/250522-exstra-liste-karte-exc.pdf>,
  <https://www.dfg.de/resource/blob/357410/250522-exstra-list-map-exc.pdf>
- Universities of Excellence continued from 2027, DFG, 11 March 2026:
  <https://www.dfg.de/resource/blob/390424/260311-exstra-exu-liste.pdf>
- New Universities of Excellence and alliances from 2027, Wissenschaftsrat press release 21/2026,
  2 October 2026: <https://www.wissenschaftsrat.de/SharedDocs/Pressemitteilungen/DE/PM_2026/PM_2126_ExStra.html>
  (checked against the release on 2026-10-12: Freiburg, Jena, Köln, Rhein-Main-Universitäten,
  Ruhr Innovation Lab; 15 sites from 1 January 2027)
- Universities of Excellence since November 2019, Wissenschaftsrat:
  <https://www.wissenschaftsrat.de/DE/Aufgabenfelder/Wettbewerbliche_Begutachtungen/Exzellenzstrategie/Foerderung_seit_Nov_2019/foerderung_seit_nov_19_node>

Notes: one place per city (several universities or clusters in one city share a node); the
2027 list no longer contains Konstanz. Places are the towns of the GeoNames data, not campus
coordinates (those are in the JSON for later use).

## City puzzles (Phase 6)

Districts as places, from Wikidata (CC0), built with `npx tsx cli/wikidata.ts <list>` (the
SPARQL query and the retrieval date are in each file's header) and turned into puzzles by a
search over the list as pool:
`npx tsx cli/collection.ts list --file docs/data/curated/<list>.txt --region DE-BE --pool --n 20 --merge 0 …`.

| list                     | puzzle                  | pool          | purpose |
| ------------------------ | ----------------------- | ------------- | ------- |
| `berlin-ortsteile.txt`   | Berlin: 20 Ortsteile    | 96 Ortsteile  | board (string gap 37.1 mm) |
| `hamburg-stadtteile.txt` | Hamburg: 20 Stadtteile  | 104 Stadtteile | board (string gap 10.8 mm) |

Notes: coordinates are Wikidata's point for each district (usually its centre or main
square), not a centroid of the official boundaries. Districts are custom places without
population, so the search chooses them by gap and difficulty only; `--merge 0` keeps
neighbouring districts apart.
