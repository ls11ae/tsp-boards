# Curated place lists

Inputs of the curated fixed instances in `public/puzzles/` (built with
`npx tsx cli/collection.ts list --file docs/data/curated/<name>.txt --id <name> --title …`).
One place per line (town names of the country data); lines starting with `#` are comments.

| list                              | puzzle                                         | places | purpose |
| --------------------------------- | ---------------------------------------------- | ------ | ------- |
| `exzellenzuniversitaeten-2027-brett.txt` | Exzellenzuniversitäten ab 2027: Bonn/Köln also combined | 13 places (3 composite; München ×2) | digital since 2026-10-17 (roadmap 9.14) |
| `exzellenzstrategie-2027.txt` | no puzzle since 2026-10-17 (roadmap 9.13): the source of the 37-city poster (`docs/posters/exzellenzstrategie-2027/`, alliances split into their cities) | 34 places: universities and alliances (14, marked) and the 20 further cluster sites | – |
| `exzellenzstrategie-2027-brett.txt` + `.board.json` | Exzellenzstrategie 2026–2033, the 300 × 600 mm board (roadmap 9.1, files in `docs/boards/exzellenzstrategie-2027/`) | 25 places: universities (14, marked), cluster sites with at least two clusters, all cluster sites in NRW | board (string gap 5.71 mm with 2.0 mm nails and 1 mm string, 4.14 mm at the scale; start nail Ruhr Innovation Lab) |
| `exzellenzstrategie-2027-37.txt` | Exzellenzstrategie: alle 37 Städte, the game behind the 37-place poster (roadmap 9.10) | 37 places: as the 34, but the cities of the two alliances as separate places (marked) | digital (string gap 2.09 mm) |
| `ruhrgebiet.txt` | Ruhrgebiet: 11 Städte, a local puzzle for the booth (roadmap 9.5, easy level of the event mode) | the 11 independent cities of the Regionalverband Ruhr (fixed; its four districts left out) | digital (string gap 2.57 mm on the NRW map) |

Lines starting with `*` are marked places (a ring on the board and in the app); a town's own
label follows a semicolon: München has two Universities of Excellence (LMU, TUM) and is
`* München; München ×2` wherever it carries the ring, so that the rings add up to the 15
Universities of Excellence and alliances (English boards and posters show "Munich ×2"). The
`.board.json` file holds the board's legend and its preferred start nail
(`cli/collection.ts list … --board-extras`). Puzzles of the Excellence Strategy removed on
2026-10-17 (roadmap 9.13) and their lists are in the git history.

Sources (retrieved 2026-10-12; details, universities, cluster names and coordinates in
`excellence-strategy-2026-10-12.json`):

- Ruhr area: Regionalverband Ruhr, member cities and districts, <https://www.rvr.ruhr/>
  (retrieved 2026-10-16).
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

## Europe (roadmap 8.1)

From the Europe data file (`public/data/countries/eu.json`: GeoNames towns with at least 50,000
inhabitants in 47 countries, see the decision log).

| list / search | puzzle | places | purpose |
| --- | --- | --- | --- |
| `europa-hauptstaedte.txt` | Europas Hauptstädte | 40 capitals (fixed; capitals below 50,000 inhabitants are not in the data) | digital (string gap 0.72 mm, many close pairs in the Balkans) |
| search `--region EU --n 30 --weights 1,0.5,2 --min-pop 300000 --board 800x600` | Europa: 30 Städte | 30 cities | board (string gap 8.87 mm, landscape board 800 × 600 mm) |

## World (roadmap 8.2)

From the world data file (`public/data/countries/wo.json`: GeoNames towns with at least 250,000
inhabitants, city districts merged, continents as regions; distances on the sphere, see the
decision log). World puzzles are digital; lengths are great-circle kilometres.
Exception: the world board (roadmap 9.15) measures on the flat Equal Earth map, as the string
does, and gives the leg across the Pacific (an open path, `--path 'Los Angeles,Sydney'`):

```
npx tsx cli/collection.ts list --file docs/data/curated/welt-pazifik.txt --region WO --title 'Rund um die Welt' --board 600x300 --margin 12 --label 4 --min-dist 10 --nail 2 --string 1 --target 5 --path 'Los Angeles,Sydney' --id welt-pazifik-brett --purpose board --flat --board-extras docs/data/curated/welt-pazifik-brett.board.json --description '…'
npx tsx cli/collection.ts list --file docs/data/curated/welt-pazifik.txt --region WO --title 'Rund um die Welt' --board 600x300 --margin 12 --label 4 --min-dist 10 --nail 2 --string 1 --target 5 --path 'Los Angeles,Sydney' --id welt-pazifik --purpose digital --description '…'
```

| list / search | puzzle | places | purpose |
| --- | --- | --- | --- |
| `olympia-sommerspiele.txt` | Olympische Sommerspiele | 23 host cities 1896–2024 (fixed) | digital (gap 88 km = 0.15 %; Rio de Janeiro → Melbourne runs past Antarctica) |
| search `--region WO --n 30 --seed 1 --weights 0.3,1,3 --min-pop 2000000` | Welt: 30 Metropolen | 30 cities on all continents (Asia 11, Europe 7, North America 4, Africa 4, South America 2, Oceania 2; well-known by Wikipedia editions, roadmap 9.6) | digital (gap 248 km = 0.34 %; the optimum on the flat map is 3,164 km longer on the sphere) |
| `80-tage-um-die-welt.txt` | In 80 Tagen um die Welt | 9 stations of Jules Verne's novel (fixed) | digital (gap 517 km = 1.56 %; Fogg's route is the optimum, once around the world) |
| `einmal-um-die-welt.txt` | Einmal um die Welt | 20 cities of the northern mid-latitudes (fixed) | digital (gap 172 km = 0.47 %; the optimum goes once around the world) |
| `welt-pazifik.txt` (+ `welt-pazifik-brett.board.json`) | Rund um die Welt, the world board and its digital version (roadmap 9.15) | 40 cities chosen by `cli/world-board.ts` (fixed); an open path from Los Angeles to Sydney, the flight across the Pacific given | board 600 × 300 mm on the flat map (`--flat`; string gap 7.34 mm, 7.34 mm at the scale at Sydney; files in `docs/boards/welt-pazifik/`) and digital on the sphere (gap 109 km = 0.16 %; the same order as on the board) |

Source of the Olympic list: International Olympic Committee, list of the Olympic Games,
<https://www.olympics.com/en/olympic-games> (retrieved 2026-10-13); one place per city.
