# Guides and cards (roadmap 9.19)

Printed material for the open day, made from the repository by `cli/print.ts` (all A4 PDFs,
German):

| file               | what                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bauanleitung.pdf` | building guide for the Excellence board, the world board and the incremental test board: material, laser, drilling, nails, calibration, checks, the template, a checklist; figures from the laser files                                      |
| `messestand.pdf`   | the booth: two laptops per game with table labels, Chrome in kiosk mode, the second screen, offline use, names and removing entries, what to do if something goes wrong, and what the app contains                                           |
| `karten.pdf`       | take-away cards A7, four per sheet with cut marks: front TSP Boards (a mini map of "Deutschland: 40 Städte" with its shortest round trip), back Ruler of the Plane (castles with their Voronoi regions), each with a QR code and the address |

These are the neutral versions (the logos' names as text). Versions with the logos of TU
Dortmund, the Faculty of Computer Science and Chair 11 are written to the git-ignored
`local/print/` from the logo files in `local/` (`tu-dortmund.svg`, `fakultaet-informatik.svg`,
`ae-logo.svg`), as for the posters; they never go into the repository.

```bash
npx tsx cli/print.ts
```

The numbers in the building guide come from the puzzle files and board reports in
`docs/boards/` (re-run the command after re-exporting a board). Every QR code on the cards and
in the booth guide is decoded in a test (`src/core/print/print.test.ts`).

Printing the cards: both sides, flip on the long edge, at 100 % (no "fit to page"), on card
stock; then cut at the marks (the backs are mirrored so that every card's back lies behind its
front).
