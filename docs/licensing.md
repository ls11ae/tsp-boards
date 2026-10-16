# Licensing and publication

Prepared 2026-10-16 (roadmap Phase 10). The code license is the maintainers' decision (TU
Dortmund, Chair 11; the university may have a policy): this note lists what the repository
contains, which terms already apply, a recommendation and a checklist for making the
repository public.

## What is in the repository and which terms already apply

| part                                                   | where                                                                                         | terms                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Our code (app, core, workers, CLI, data build, server) | `src/`, `cli/`, `scripts/`, `server/`, config files                                           | **to be chosen**                                                                                                                                                 |
| Documentation, design notes, experiments               | `docs/`, `README.md`                                                                          | to be chosen (with the code, or CC BY 4.0)                                                                                                                       |
| City data built from GeoNames                          | `public/data/countries/*.json`, the places in `public/puzzles/`                               | **CC BY 4.0** (GeoNames): attribution required; credited in the app's footer, the data files' `attribution`, on boards and posters and in the README             |
| Borders from Natural Earth                             | in the same data files                                                                        | public domain                                                                                                                                                    |
| Fame of world cities, themed lists                     | `public/data/countries/wo.json` (`fame`), `docs/data/curated/`                                | Wikidata: CC0                                                                                                                                                    |
| Board font (outlines of Fira Sans Condensed Medium)    | `src/core/board/font-data.ts` (generated)                                                     | **SIL Open Font License 1.1**: the file is font software and stays under the OFL (keep its header); text set with it on boards, posters and PDFs is not affected |
| Generated boards and posters                           | `docs/boards/`, `docs/posters/`                                                               | contain GeoNames data: CC BY 4.0 attribution (printed in their footers); otherwise as the documentation                                                          |
| Logos of partners                                      | never in the repository (`local/` is git-ignored; a test checks that no logo file is tracked) | their owners' rights                                                                                                                                             |

Runtime dependencies (bundled into `dist/`): React, React DOM, scheduler, zustand, fflate,
highs (HiGHS compiled to WebAssembly) — all **MIT**; d3-geo, d3-array, internmap,
topojson-client — **ISC**. Development only (not shipped): opentype.js (MIT), mapshaper and
@resvg/resvg-js (**MPL-2.0**, used as tools, not modified, not bundled), TypeScript, Vite,
Vitest, ESLint, Prettier (permissive). All of these are compatible with any of the licenses
below.

The build writes `third-party-licenses.txt` into `dist/` with the license texts of the bundled
dependencies (MIT and ISC require the notices to travel with copies), and the app's footer
links to it.

## Recommendation

**MIT** for the code (and the documentation with it), with the third-party terms above kept
as they are:

- Short and widely known; matches all runtime dependencies (MIT/ISC), so nothing changes for
  people who reuse parts (e.g. the exact TSP code or the board export).
- Common for research software that should be reused in teaching and at other chairs.
- Alternatives: **Apache-2.0** (adds an explicit patent grant and a NOTICE mechanism; longer),
  **GPL-3.0** or **AGPL-3.0** (keeps derivatives open, including a hosted copy for AGPL, but
  limits reuse in other projects). For the documentation alone, CC BY 4.0 would be the usual
  choice.

Copyright line, e.g.: "Copyright (c) 2026 TU Dortmund University, Chair 11 Algorithm
Engineering" (or the authors; to be decided with the chair).

## Checklist before making the repository public

1. Choose the license; add `LICENSE` at the root and `"license"` in `package.json`; replace the
   "License" section of the README (keep the data, font and thesis credits).
2. Keep `src/core/board/font-data.ts` under the OFL (its header says so) and mention it in the
   README's license section.
3. Check the history for anything that must not be public: no secrets were ever committed
   (no API keys are used); `local/` (logos, mock-ups) was never tracked; play records live only
   on the server. The docs name reviewers by first name (roadmap, design notes) and commits
   carry the authors' e-mail addresses — fine for a university project, but decide it
   consciously.
4. Deployment and the play data endpoint (`docs/deployment.md`) are independent of the
   license; the app's footer already credits GeoNames, Natural Earth and the thesis.
