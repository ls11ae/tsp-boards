# Ruhr Innovation Lab posters (Exzellenzstrategie 2026–2033)

Posters for the corridor of Chair 11 that celebrate the Ruhr Innovation Lab (RIL) (roadmap 9.7,
9.9): the shortest round trip through the sites of the Excellence Strategy, starting and ending
at the RIL. Six variants for choosing the number of places, each in German (`de/`) and
English (`en/`), DIN A1 portrait as vector PDF with a PNG preview. A0 and the versions with the
RIL logo are built locally (below), never committed.

![The six German variants side by side](de/exzellenzstrategie-2027-varianten-A1.png)

## The variants

| Variant                                                                | file        | Places | Length   | Second-best | Possible round trips |
| ---------------------------------------------------------------------- | ----------- | ------ | -------- | ----------- | -------------------- |
| Universities of Excellence and alliances                               | `poster-14` | 14     | 2,039 km | +3.4 km     | 3.1 · 10⁹            |
| the same, every city of an alliance a stop of its own                  | `poster-17` | 17     | 2,078 km | +0.6 km     | 1.0 · 10¹³           |
| universities plus all sites with at least two Clusters of Excellence   | `poster-22` | 22     | 2,521 km | +1.4 km     | 2.6 · 10¹⁹           |
| the board selection (plus all cluster sites in North Rhine-Westphalia) | `poster-25` | 25     | 2,534 km | +8.0 km     | 3.1 · 10²³           |
| all sites of the Excellence Strategy                                   | `poster-34` | 34     | 2,838 km | +1.8 km     | 4.3 · 10³⁶           |
| all sites, every city of an alliance a stop of its own                 | `poster-37` | 37     | 2,879 km | +2.4 km     | 1.9 · 10⁴¹           |

Files: `de/` and `en/` hold `exzellenzstrategie-2027-poster-<n>-A1.pdf` (print) and `.png`
(preview at 30 dpi) and one contact sheet each (`exzellenzstrategie-2027-varianten-A1.png`);
`report.md` has the order of each round trip and the checks; `variants.json` holds the titles,
subtitles and legends of both languages.

## What the posters show

- **The Ruhr Innovation Lab is prominent:** the round trip starts and ends there ("Start und
  Ziel" / "Start and finish", a red ring at the first stop); its name is large, bold and red
  at its outline; Bochum and Dortmund are named dots inside a red outline, also where the RIL
  is one stop at their centre (14, 22, 25, 34). With the logo (local versions) the RIL logo
  stands about 100 mm wide (A1) in free space near the outline, over the Netherlands, with a
  thin line to the outline, and replaces the red name.
- **Little text:** one line states the problem with the number of possible round trips,
  (n − 1)!/2, e.g. "Finde die kürzeste Rundreise unter 4,3 · 10³⁶ Möglichkeiten." / "Find the
  shortest round trip out of 4.3 × 10³⁶ options."; below it, large, the answer (the length in
  km); one small line says that it is the great-circle length, proven shortest with integer
  linear optimisation (HiGHS). The legend explains rings, dots and alliances; notes come after
  the symbol lines.
- **Labels keep off the round trip:** no label covers a leg, an outline of another alliance or
  the logo, and each name sits clearly next to its own dot (checked for all files; see
  `report.md`).
- **German and English:** English uses the official terms (Excellence Strategy, Universities of
  Excellence, Clusters of Excellence, excellence alliance, Rhine-Main Universities), English
  place names where they are common (Munich, Cologne, Hanover) and the English number format
  (2,534 km; 3.1 × 10²³).
- **Footer:** the chair line in large type (cap height about 5 mm on A1), the data credits
  below. The bottom right is free for a TU Dortmund logo (`--corner-logo`, only from `local/`)
  and later the QR code to the play link.

Checks: in all six variants the shortest round trip on the flat map (the measure the app
judges against) is the same round trip as by great-circle distance (1.0–1.5 km longer on the
map). The lengths and round-trip counts match Kevin's check of 2026-10-16; the second-best
differs by 0.1 km in two variants, from rounding.

## Titles

The posters use the first title; the others are proposals (change them in `variants.json`):

1. "Vom Ruhr Innovation Lab durch Deutschlands Exzellenz" / "From the Ruhr Innovation Lab
   through Germany's excellence".
2. "Die kürzeste Rundreise durch Deutschlands Exzellenz" / "The shortest round trip through
   Germany's excellence".
3. "Exzellent unterwegs: einmal rund ab dem Ruhr Innovation Lab" / "An excellent journey: once
   around from the Ruhr Innovation Lab".

## Printing

Vector PDF, text as outlines, white margin of 18 mm on A1 (no bleed needed). Type and lines
scale with the paper, so A0 is A1 enlarged by √2: on A1 the title has a cap height of about
17 mm and the length about 25 mm, readable from 3 m or more.

## Rebuilding

The committed A1 versions in German and English, without logo:

```bash
npx tsx cli/export-poster.ts --variants docs/posters/exzellenzstrategie-2027/variants.json
```

A0, and the versions with the RIL logo (A1 and A0), with one command into the git-ignored
`local/posters/` (the logo files are in `local/`, see `local/LIESMICH-logo.txt`; never commit
them or files containing them):

```bash
npx tsx cli/export-poster.ts --variants docs/posters/exzellenzstrategie-2027/variants.json --out local/posters --paper A1,A0 --also-plain --suffix -logo --logo "Ruhr Innovation Lab=local/ruhr-innovation-lab-textur.svg" --corner-logo local/tu-dortmund.svg
```

This writes `local/posters/<de|en>/exzellenzstrategie-2027-poster-<n>-<A1|A0>-logo.pdf` (and
`.png`), the same without `-logo` (A0 is the new one), contact sheets per language and paper,
and reports. A missing logo file is reported, and the posters are built without it (the TU
Dortmund logo is not in `local/` yet: put it there as `tu-dortmund.svg`).

The app's export panel makes the same poster ("Plakat (PDF)") for any map puzzle, in the app's
language, with title, subtitle and legend editable before the export and any place to
emphasize; its logo can be loaded from a local SVG file and stays in the browser.
