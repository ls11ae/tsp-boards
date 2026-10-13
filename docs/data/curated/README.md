# Curated place lists

Inputs of the curated fixed instances in `public/puzzles/` (built with
`npx tsx cli/collection.ts list --file docs/data/curated/<name>.txt --id <name> --title …`).
One place per line (town names of the country data); lines starting with `#` are comments.

| list                              | puzzle                                         | places | purpose |
| --------------------------------- | ---------------------------------------------- | ------ | ------- |
| `exzellenzuniversitaeten-2027.txt` | Universities of Excellence and alliances, 2027–2033 | 14 places (2 composite: Rhein-Main-Universitäten, Ruhr Innovation Lab) | digital (string gap 3.24 mm, 0.37 mm with one place per city) |
| `exzellenzuniversitaeten-2027-brett.txt` | board variant: Bonn/Köln also combined | 13 places (3 composite) | board (string gap 10.15 mm) |
| `exzellenzcluster-2026.txt`        | Clusters of Excellence, 2026–2032 (70 clusters) | 37 cities | digital (string gap 2.1 mm) |
| `exzellenzcluster-2026-verbuende.txt` | Clusters of Excellence, neighbouring sites combined | 32 places (4 composite) | digital (string gap 1.14 mm; no nails closer than 25 mm) |

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
- Universities of Excellence since November 2019 (the 2019–2026 puzzle was removed on
  2026-10-13; the data stays in the JSON), Wissenschaftsrat:
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

## Themed instances from Wikidata (Phase 6)

Town lists built with `npx tsx cli/wikidata.ts <list>` and matched to the towns of the
country data (Wikidata id, else name or name prefix within 15 km; items that are not a town of
the data, e.g. former Hanseatic towns that are now districts, are left out and named in the
file header).

| list                       | puzzle                      | places          | purpose |
| -------------------------- | --------------------------- | --------------- | ------- |
| `landeshauptstaedte.txt`   | Landeshauptstädte (fixed)   | 16 capitals     | digital (string gap 18.6 mm, but Mainz–Wiesbaden only 10 mm apart on the default board) |
| `landeshauptstaedte-brett.txt` | Landeshauptstädte (Brett): Mainz/Wiesbaden combined | 15 places (1 composite) | board (string gap 18.6 mm) |
| `hansestaedte.txt`         | Hansestädte: 25 Orte (pool) | 136 Hanseatic towns (class "Hansestadt") | board (8.9 mm); Lübeck, Stralsund, Wismar pinned |
| `universitaetsstaedte.txt` | Universitätsstädte: 30 Orte (pool) | 74 towns with a university | board (10.0 mm) |

Notes: "university" means an institution of a subclass of Q3918 whose German name contains
"Universität" (plus RWTH Aachen and KIT), located in (P131) the town; universities of applied
sciences are not included. The title class "Universitätsstadt" is incomplete in Wikidata
(45 towns, without Heidelberg or Leipzig) and was not used.

## Board variants (roadmap 7.5)

Found with `npx tsx cli/variants.ts public/puzzles/<id>.tsp.json` (the same analysis as
"Find a board variant" in the designer): which single removal or combination of two places
raises the string gap above the 5 mm target with no nails closer than 25 mm. The state capitals
only needed Mainz and Wiesbaden (10 mm apart) as one place; the 2027 list reaches 10.15 mm with
Bonn and Köln combined (20.6 mm apart, partners in three clusters). For the clusters no single
change reaches the target (best 4.35 mm in both lists), so they stay digital; a larger board
(the gap grows with the scale) would make them boards.
