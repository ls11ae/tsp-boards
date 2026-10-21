// Guides and cards for the open day (roadmap 9.19, 9.21), as A4 PDFs from the repository:
//   - Bauanleitung: building the Excellence board, the world board and the incremental test
//     board (figures from the laser files, numbers from the puzzle files and board reports),
//   - Messestand: the booth with two laptops per game, and what the app contains,
//   - Karten: A7 take-away cards (four per sheet, both sides) with QR codes.
// Neutral versions go to docs/print/; versions with logos (TU Dortmund, the faculty, Chair 11,
// read from local/ as for the posters) only to local/print/, never into the repository. The logo
// version of the building guide also shows the Excellence board's logo laser file from
// local/boards/.
// Usage: npx tsx cli/print.ts [--out docs/print] [--logo-dir local] [--logo-out local/print]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { boardMapLines } from '../src/core/board/map-lines';
import { parseSvgColorLogo } from '../src/core/board/logo-color';
import type { Logo } from '../src/core/board/logo';
import type { PdfCanvas } from '../src/core/board/pdf';
import { boardSetup } from '../src/core/board/setup';
import { transformPath, type Matrix } from '../src/core/board/shapes';
import { citiesFromColumns } from '../src/core/data';
import { DEFAULT_PARAMS } from '../src/core/params';
import { listCities } from '../src/core/places';
import { cardsPdf, RULER_URL, TSP_URL, type MiniMap } from '../src/core/print/cards';
import { documentPdf, type Block, type PrintDocument } from '../src/core/print/document';
import { localText, parsePuzzleDoc, type PuzzleDoc } from '../src/core/puzzle-file';
import { loadCountry } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const OUT = arg('out', 'docs/print');
const LOGO_DIR = arg('logo-dir', 'local');
const LOGO_OUT = arg('logo-out', 'local/print');
/** Today in local time (YYYY-MM-DD). */
const TODAY = new Date().toLocaleDateString('sv-SE');
/** The Excellence board's laser file with the logo, in the shared folder (never in the repository). */
const EX_LOGO_BED = 'exzellenzstrategie-2027-logo-bed.svg';
const EX_LOGO_BOARD = 'local/boards/exzellenzstrategie-2027-logo.svg';
const XTOOL_SETTINGS = 'https://uk.xtool.com/pages/material-settings';

/** German number with a decimal comma. */
const de = (x: number, digits = 1) =>
  x.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const read = (file: string) => readFileSync(file, 'utf8');
const puzzle = (id: string): PuzzleDoc =>
  parsePuzzleDoc(JSON.parse(read(`public/puzzles/${id}.tsp.json`)));

// --- numbers from the board reports ------------------------------------------------------------

interface MapBoard {
  readonly title: string;
  readonly places: number;
  readonly size: string;
  readonly gapMm: number;
  readonly scaleGapMm: number;
  /** Smallest and largest string gap and gap at the scale over r_eff 1.0–2.0 mm. */
  readonly robust: { readonly gap: [number, number]; readonly scale: [number, number] };
  readonly path: readonly string[];
  readonly runnerUp: readonly string[];
  readonly runnerUpBeforeMm: number;
  /** String from the loop or knot to the target mark, mm. */
  readonly stringMm: number;
  readonly svg: string;
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** The first line with arrows after a heading that starts with `heading`. */
function pathAfter(report: string, heading: RegExp): string[] {
  const lines = report.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`report: no section ${heading}`);
  const line = lines.slice(start + 1).find((l) => l.includes(' → '));
  if (!line) throw new Error(`report: no path after ${heading}`);
  return line.split(' → ').map((s) => s.trim());
}

function mapBoard(id: string, dir: string, name: string): MapBoard {
  const doc = puzzle(id);
  const report = read(`${dir}/${name}-report.md`);
  const rows = report.split('\n').filter((l) => /^\| \d\.\d\d \|/.test(l));
  if (rows.length === 0) throw new Error(`${name}: no robustness table`);
  const gaps = rows.map((r) => numbersIn(r.split('|')[3]!)[0]!);
  const scales = rows.map((r) => numbersIn(r.split('|')[4]!).at(-1)!);
  const runner = report.slice(report.search(/## (String r|R)unner-up/));
  const before = /ends (\d+(?:\.\d+)?) mm before 0/.exec(runner);
  const string = /: (\d+) mm, plus (\d+) mm along the scale/.exec(report);
  if (!before || !string) throw new Error(`${name}: report without runner-up or string length`);
  const p = doc.map!.params;
  return {
    title: localText(doc.title, 'de'),
    places: doc.map!.places.length,
    size: `${p.boardWidthMm} × ${p.boardHeightMm} mm`,
    gapMm: doc.map!.results!.gapMm!,
    scaleGapMm: doc.map!.results!.scaleGapMm!,
    robust: {
      gap: [Math.min(...gaps), Math.max(...gaps)],
      scale: [Math.min(...scales), Math.max(...scales)],
    },
    path: pathAfter(report, /^## (Tour from the start nail|Path from the start nail)/),
    runnerUp: pathAfter(report, /^## (String r|R)unner-up/),
    runnerUpBeforeMm: Number(before[1]),
    stringMm: Number(string[1]) + Number(string[2]),
    svg: `${dir}/${name}.svg`,
  };
}

/**
 * Where the runner-up differs from the optimum: its stretch and the optimum's. The report may
 * list a round trip in the other direction (the one that ends nearest to 0), so both are tried.
 */
function difference(optimum: readonly string[], runnerUp: readonly string[]): [string, string] {
  const span = (other: readonly string[]) => {
    let a = 0;
    while (a < optimum.length && optimum[a] === other[a]) a++;
    let b = 0;
    while (b < optimum.length - a && optimum.at(-1 - b) === other.at(-1 - b)) b++;
    const cut = (list: readonly string[]) => list.slice(Math.max(0, a - 1), list.length - b + 1);
    return [cut(other), cut(optimum)] as const;
  };
  const reversed = [runnerUp[0]!, ...runnerUp.slice(1).reverse()];
  const [x, y] = [span(runnerUp), span(reversed)];
  const [other, own] = x[0].length <= y[0].length ? x : y;
  return [other.join(' – '), own.join(' – ')];
}

interface IncrementalBoard {
  readonly nails: number;
  readonly size: string;
  readonly gapMm: number;
  readonly trackGapMm: number;
  readonly robustTrack: number;
  readonly svg: string;
}

function incrementalBoard(): IncrementalBoard {
  const dir = 'docs/boards/incremental-test';
  // The generator's output (cli/incremental.ts --out), not a puzzle file.
  const board = JSON.parse(read(`${dir}/tsp-incremental-12-test.json`)) as {
    params: { widthMm: number; heightMm: number; seed: number };
    points: unknown[];
    steps: { stringGapMm: number | null; measuredGapMm: number | null }[];
  };
  const gaps = board.steps.flatMap((s) => (s.stringGapMm === null ? [] : [s.stringGapMm]));
  const track = board.steps.flatMap((s) => (s.measuredGapMm === null ? [] : [s.measuredGapMm]));
  const report = read(`${dir}/tsp-incremental-12-test-report.md`);
  const rows = report.split('\n').filter((l) => /^\| \d\.\d\d \| /.test(l));
  return {
    nails: board.points.length,
    size: `${board.params.widthMm} × ${board.params.heightMm} mm`,
    gapMm: Math.min(...gaps),
    trackGapMm: Math.min(...track),
    robustTrack: Math.min(...rows.map((r) => numbersIn(r.split('|')[3]!)[0]!)),
    svg: `${dir}/tsp-incremental-12-test.svg`,
  };
}

// --- figures from the laser files ------------------------------------------------------------

/** A laser file drawn into the figure box in its layer colours (thin lines kept visible). */
function svgFigure(file: string) {
  const svg = read(file);
  const view = /viewBox="([\d.\s-]+)"/.exec(svg);
  if (!view) throw new Error(`${file}: no viewBox`);
  const [, , vw, vh] = view[1]!.trim().split(/\s+/).map(Number);
  const logo = parseSvgColorLogo(svg);
  return {
    aspect: vh! / vw!,
    draw: (c: PdfCanvas, x: number, y: number, width: number, height: number) => {
      const k = Math.min(width / vw!, height / vh!);
      const ox = x + (width - k * vw!) / 2;
      const m: Matrix = [k, 0, 0, k, ox, y];
      c.stroke(
        [
          ['M', ox, y],
          ['L', ox + k * vw!, y],
          ['L', ox + k * vw!, y + k * vh!],
          ['L', ox, y + k * vh!],
          ['Z'],
        ],
        [0.6, 0.6, 0.6],
        0.2,
      );
      for (const part of logo.parts) {
        const p = transformPath(part.path, m);
        if (part.fill) c.fill(p, part.fill, part.evenOdd);
        if (part.stroke) c.stroke(p, part.stroke.color, Math.max(0.12, part.stroke.width * k));
      }
    },
  };
}

function figure(file: string, width: number, caption: string): Block {
  const f = svgFigure(file);
  return { kind: 'figure', height: Math.min(150, width * f.aspect), draw: f.draw, caption };
}

// --- the building guide -------------------------------------------------------------------------

/**
 * The building guide; `exFigure` is the Excellence board's laser file shown as a figure (the
 * logo version shows the one with the logo).
 */
function buildingGuide(logos: PrintDocument['logos'], exFigure: string): PrintDocument {
  const ex = mapBoard(
    'exzellenzstrategie-2027-brett',
    'docs/boards/exzellenzstrategie-2027',
    'exzellenzstrategie-2027',
  );
  const wo = mapBoard('welt-pazifik-brett', 'docs/boards/welt-pazifik', 'welt-pazifik');
  const inc = incrementalBoard();
  const range = ([a, b]: [number, number]) => `${de(a, 2)}–${de(b, 2)} mm`;
  const [exRunner, exOptimum] = difference(ex.path, ex.runnerUp);
  const [woRunner, woOptimum] = difference(wo.path, wo.runnerUp);
  const blocks: Block[] = [
    {
      kind: 'title',
      text: 'Bauanleitung: TSP-Bretter aus Holz',
      subtitle: `Exzellenzstrategie-Brett, Weltbrett „Rund um die Welt“ und Testbrett „Schritt für Schritt“ · Stand ${TODAY}`,
    },
    {
      kind: 'p',
      text: 'Diese Anleitung führt Schritt für Schritt vom Holzstück zum fertigen, geprüften Brett. Alle Zahlen stammen aus den Brett-Dateien im Repository (docs/boards/); nach einem neuen Export mit gemessenen Nägeln und gemessenem Faden wird sie mit „npx tsx cli/print.ts“ neu erzeugt.',
    },
    { kind: 'h1', text: 'Die drei Bretter' },
    {
      kind: 'table',
      header: true,
      widths: [0.25, 0.25, 0.25, 0.25],
      rows: [
        ['', 'Exzellenzstrategie', 'Rund um die Welt', 'Schritt für Schritt'],
        ['Laserdatei', EX_LOGO_BED, 'welt-pazifik.svg', 'tsp-incremental-12-test.svg'],
        ['Größe', ex.size, wo.size, inc.size],
        ['Nägel', `${ex.places} Orte`, `${wo.places} Orte`, `${inc.nails} Nägel + 4 Eckstifte`],
        [
          'Start',
          'Ruhr Innovation Lab (Start und Ziel, Skala)',
          'Los Angeles (Faden festknoten)',
          'Nagel 1',
        ],
        ['Ablesen', 'Skala am Startnagel', 'Skala am Zielnagel Sydney', 'Messstrecke am Rand'],
        [
          'Fadenabstand',
          `${de(ex.gapMm, 2)} mm`,
          `${de(wo.gapMm, 2)} mm`,
          `mindestens ${de(inc.gapMm, 2)} mm`,
        ],
        [
          'An Skala/Strecke',
          `${de(ex.scaleGapMm, 2)} mm`,
          `${de(wo.scaleGapMm, 2)} mm`,
          `mindestens ${de(inc.trackGapMm, 2)} mm`,
        ],
        [
          'Robust (r_eff 1–2 mm)',
          `Skala ${range(ex.robust.scale)}`,
          `Skala ${range(wo.robust.scale)}`,
          `Strecke mindestens ${de(inc.robustTrack, 2)} mm`,
        ],
      ],
    },
    {
      kind: 'p',
      text: 'Fadenabstand heißt: Die zweitkürzeste Rundreise braucht so viel mehr Faden als die kürzeste. Genau diesen Unterschied sehen die Spielenden an der Skala.',
    },
    { kind: 'h2', text: 'Die Laserdateien' },
    {
      kind: 'bullets',
      items: [
        `Exzellenzstrategie: ${EX_LOGO_BED} mit dem Logo des Ruhr Innovation Lab, im gemeinsamen Ordner unter local/boards/ (nicht im Repository). Das Brett ist ${ex.size} im Hochformat; die Datei ist für das Bett des P2S (600 × 305 mm) um 90° ins Querformat gedreht, also 600 × 300 mm. Ersatz ohne Logo (Schriftzug „Ruhr Innovation Lab“ statt Logo): exzellenzstrategie-2027-bed.svg in docs/boards/exzellenzstrategie-2027/, ebenfalls quer.`,
        `Rund um die Welt: welt-pazifik.svg in docs/boards/welt-pazifik/ (${wo.size}, schon quer).`,
        `Schritt für Schritt: tsp-incremental-12-test.svg in docs/boards/incremental-test/ (${inc.size}); vor dem Lasern mit der gemessenen Fadendicke neu exportieren.`,
      ],
    },
    { kind: 'h1', text: 'Material und Werkzeug' },
    {
      kind: 'bullets',
      items: [
        'Birke-Multiplex 12 mm (HORNBACH „Fixmaß Multiplexplatte Birke BB/WG“ 1200 × 600 × 12 mm, im Markt in vier Stücke von etwa 298 × 600 mm geschnitten); ein halbes Stück reicht für das Testbrett.',
        'Kreppband oder Laser-Transferband, Cutter.',
        'xTool P2S (CO2-Laser, Arbeitsfläche 600 × 305 mm) mit xTool Creative Space.',
        'Akku-Bohrschrauber Bosch GSB 18V-28 mit dem Wolfcraft-Schnellspannbohrfutter 0,5–6,5 mm (Sechskantschaft); das Bosch-Futter selbst hält erst ab 1,5 mm und greift dünne Bohrer schlecht.',
        'Holzbohrer 1,5 mm, ein Stück Klebeband als Tiefenmarke, wenn vorhanden ein Bohrständer.',
        'Drahtstifte 2,0 × 20 mm mit Flachkopf (gemessen: 2,0 mm), Hammer.',
        'Sechskantmutter M14 (DIN 934, 11 mm hoch) als Höhenlehre für die Nägel.',
        'Schleifpapier (Körnung 180–240), Holzöl, Lappen.',
        'Polyesterfaden, etwa 1 mm dick, wenig dehnbar; eine Perle oder ein Knoten als Zielmarke; Schere.',
      ],
    },
    { kind: 'h1', text: 'Schritt für Schritt' },
    { kind: 'h2', text: '1. Holz vorbereiten' },
    {
      kind: 'steps',
      items: [
        'Ein Reststück desselben Holzes als Probestück verwenden: die Laserwerte (Abschnitt 2), die Bohrtiefe und das Öl daran ausprobieren.',
        'Die Oberfläche ganz mit Kreppband oder Transferband abkleben (Bahnen leicht überlappend, ohne Blasen). Das Band schützt vor Rauchflecken und wird nach dem Lasern abgezogen.',
        'Die Stücke sind 1–2 mm schmaler als 300 mm: Die Datei bleibt bei 300 mm und wird mittig aufs Holz gelegt (die Karte hält 12–15 mm Abstand vom Rand).',
      ],
    },
    { kind: 'h2', text: '2. Laserwerte für den xTool P2S (55 W)' },
    {
      kind: 'note',
      text: 'Ungetestete Startwerte: Die Werte unten sind nicht ausprobiert. Der Test auf einem Reststück entscheidet; das erste Brett erst mit den getesteten Werten lasern.',
    },
    {
      kind: 'p',
      text: `Grundlage ist die Materialtabelle von xTool für P2 und P2S, Lindensperrholz (basswood plywood) 3–12 mm: Ritzen 12 % bei 160 mm/s, Vektorgravur 10 % bei 200 mm/s mit 100 Linien/cm (Quelle: ${XTOOL_SETTINGS}). Birke ist dichter als Linde, deshalb hier etwas mehr Leistung.`,
    },
    {
      kind: 'table',
      header: true,
      widths: [0.18, 0.205, 0.205, 0.205, 0.205],
      rows: [
        [
          'Farbe in der SVG',
          'Schwarz (Fläche)',
          'Magenta (Fläche)',
          'Blau (Linie)',
          'Grün (Linie)',
        ],
        [
          'Was',
          'Titel, Ortsnamen, Ringe, Legende, Zahlen und Zielmarke der Skala',
          'je ein 1-mm-Punkt an jedem Nagel: die Bohrmulden',
          'innere Grenzen, Nachbarländer, Skalenstriche, gestrichelter Pazifikflug',
          'Küsten und Umriss des Landes oder der Kontinente',
        ],
        [
          'Bearbeitung',
          'Gravieren (Füllung)',
          'Gravieren (Füllung), Mulde etwa 0,5–1 mm tief',
          'Ritzen',
          'Ritzen, stärker',
        ],
        ['Leistung', '15 % (18 % durch Kreppband)', '40 %', '15 %', '22 %'],
        ['Geschwindigkeit', '200 mm/s', '100 mm/s', '160 mm/s', '160 mm/s'],
        ['Linien/cm', '100', '100', '–', '–'],
        ['Durchgänge', '1', '3', '1', '1'],
      ],
    },
    {
      kind: 'p',
      text: 'Für alle Farben: Material „Benutzerdefiniert“ (custom material) mit Dicke 12 mm, Autofokus, Luftunterstützung (Air Assist) an, Absaugung an, das Brett liegt flach auf der Arbeitsfläche. Reihenfolge: Gravieren (schwarz), Bohrmulden (magenta), Ritzen (blau), Umriss (grün). Rot und Orange (Schneiden) kommen in diesen Dateien nicht vor: Das Holz ist zugeschnitten, die Löcher werden gebohrt.',
    },
    {
      kind: 'p',
      text: 'Test auf einem Reststück (12 mm Birke, abgeklebt wie das Brett) mit dem Material-Testarray (material test array) von xTool Creative Space:',
    },
    {
      kind: 'steps',
      items: [
        'Gravieren: Leistung 10–30 % in Schritten von 5 % (10, 15, 20, 25, 30 %) gegen die Geschwindigkeiten 150, 200 und 250 mm/s, 100 Linien/cm, durch das Kreppband. Gesucht: dunkel und scharf, ohne Brandränder.',
        'Ritzen: Linien mit 10, 15, 20 und 25 % bei 160 mm/s. Gesucht: eine feine, gut sichtbare Linie für Blau und eine kräftigere für Grün, beide nicht durchgebrannt.',
        'Bohrmulde: einen Kreis von 1 mm Durchmesser (Füllung) bei 40 % und 100 mm/s je einmal mit 1, 2 und 3 Durchgängen. Gesucht: eine Mulde von etwa 0,5–1 mm Tiefe, die die Spitze des 1,5-mm-Bohrers sicher führt (mit dem Bohrer oder dem Tiefenmaß eines Messschiebers prüfen).',
        'Das Band abziehen, die besten Werte in die Tabelle eintragen und für alle Bretter verwenden.',
      ],
    },
    {
      kind: 'table',
      header: true,
      fillIn: 9,
      widths: [0.18, 0.205, 0.205, 0.205, 0.205],
      rows: [
        [
          'Getestet',
          'Schwarz: Gravieren',
          'Magenta: Bohrmulden',
          'Blau: Ritzen',
          'Grün: Ritzen stark',
        ],
        ['Leistung (%)', '', '', '', ''],
        ['Geschwindigkeit (mm/s)', '', '', '', ''],
        ['Linien/cm', '', '', '–', '–'],
        ['Durchgänge', '', '', '', ''],
        ['Bemerkung', '', '', '', ''],
      ],
    },
    { kind: 'h2', text: '3. Laserdatei in xTool Creative Space' },
    {
      kind: 'steps',
      items: [
        'Die SVG-Datei importieren und prüfen, dass sie in Originalgröße (Millimeter) liegt: 600 × 300 mm für das Exzellenzstrategie-Brett (die quer gedrehte -bed.svg) und das Weltbrett, 300 × 300 mm für das Testbrett.',
        'Jeder Farbe die Bearbeitung und die getesteten Werte aus der Tabelle zuweisen, in der Reihenfolge Gravieren, Bohrmulden, Ritzen, Umriss.',
        'Das Holzstück quer in den Laser legen und die Datei mit der Kamera mittig darauf ausrichten (gleich viel Rand links und rechts bzw. oben und unten). Mit „Rahmen“ die Umrandung abfahren lassen.',
        `Lasern. Das Exzellenzstrategie-Brett liegt quer im P2S, weil ${EX_LOGO_BED} schon ins Querformat gedreht ist.`,
      ],
    },
    { kind: 'h2', text: '4. Bohren' },
    {
      kind: 'steps',
      items: [
        'Das Band abziehen.',
        'Den 1,5-mm-Bohrer im Wolfcraft-Schnellspannfutter in den Bosch-Bohrschrauber setzen und bei 9 mm ein Stück Klebeband als Tiefenmarke um den Bohrer wickeln.',
        'An jedem Bohrpunkt senkrecht etwa 9 mm tief bohren (nicht durch die 12 mm). Der gravierte Punkt führt die Bohrerspitze; ein Bohrständer hilft, gerade zu bleiben.',
        'Beim Testbrett auch die vier Eckstifte der Messstrecke bohren.',
      ],
    },
    { kind: 'h2', text: '5. Schleifen und Ölen' },
    {
      kind: 'steps',
      items: [
        'Leicht mit Körnung 180–240 in Faserrichtung schleifen, Staub abwischen.',
        'Ölen und trocknen lassen, bevor die Nägel kommen (sonst sammelt sich das Öl an den Nägeln).',
      ],
    },
    { kind: 'h2', text: '6. Nägel setzen' },
    {
      kind: 'steps',
      items: [
        'Die Drahtstifte 2,0 × 20 mm in die Löcher setzen und einschlagen, bis etwa 11 mm herausstehen.',
        'Die Mutter M14 (11 mm hoch) neben den Nagel stellen und schlagen, bis der Kopf mit der Mutter abschließt. So stehen alle Nägel gleich hoch und senkrecht.',
      ],
    },
    { kind: 'h2', text: '7. Faden kalibrieren' },
    {
      kind: 'p',
      text: 'Das Lösungsblatt jedes Bretts (…-solution.pdf, nicht den Spielenden zeigen) nennt die Reihenfolge und die Fadenlänge.',
    },
    {
      kind: 'bullets',
      items: [
        `Exzellenzstrategie: eine lockere Schlaufe um den Startnagel Ruhr Innovation Lab legen, die kürzeste Rundreise in der Reihenfolge des Lösungsblatts wickeln (${ex.path.slice(0, 3).join(' – ')} …), zurück zum Startnagel, einmal um ihn herum und gerade an der Skala entlang. An der Zielmarke „0“ markieren (Knoten oder Perle) und abschneiden. Vom Startnagel bis „0“ sind es etwa ${de(ex.stringMm, 0)} mm Faden.`,
        `Rund um die Welt: den Faden am Startnagel Los Angeles festknoten, den Weg bis Sydney wickeln (${wo.path.slice(0, 3).join(' – ')} … ${wo.path.at(-1)!}), einmal um den Zielnagel Sydney und gerade an der Skala entlang; an „0“ markieren und abschneiden. Vom Knoten bis „0“ etwa ${de(wo.stringMm, 0)} mm. Der gestrichelte Rückflug über den Pazifik wird nicht gewickelt.`,
        'Schritt für Schritt: eine lockere Schlaufe um Nagel 1, die kürzeste Rundreise durch alle 12 Nägel wickeln, zurück um Nagel 1 zur nächsten Ecke und im Uhrzeigersinn um die Eckstifte an der Messstrecke entlang; an der Marke „12“ markieren und abschneiden.',
      ],
    },
    { kind: 'h2', text: '8. Prüfen' },
    {
      kind: 'bullets',
      items: [
        `Exzellenzstrategie: Die zweitkürzeste Rundreise unterscheidet sich nur hier: ${exRunner} statt ${exOptimum}. Mit ${ex.runnerUp[1]} als zweitem Ort gewickelt endet sie etwa ${de(ex.runnerUpBeforeMm, 1)} mm vor „0“, also außerhalb des Rahmens um „0“.`,
        `Rund um die Welt: Der zweitkürzeste Weg nimmt ${woRunner} statt ${woOptimum} und endet etwa ${de(wo.runnerUpBeforeMm, 1)} mm vor „0“.`,
        `Schritt für Schritt: zwei oder drei Instanzen mit dem Lösungsblatt nachwickeln: Das Fadenende der kürzesten Rundreise erreicht das Feld seiner Marke, die zweitkürzeste endet mindestens ${de(inc.trackGapMm, 1)} mm davor.`,
        'Verfehlt die kürzeste Rundreise die „0“ um mehr als 1–2 mm, dehnt sich der Faden oder ein Nagel steht schief.',
      ],
    },
    {
      kind: 'note',
      text: 'Nägel und Faden zuerst messen: Mit anderen Werten bleibt die kürzeste Rundreise dieselbe, aber die Marken des Testbretts hängen vom Faden ab. Vor dem Lasern deshalb mit gemessenem Faden neu exportieren (Befehle in den READMEs von docs/boards/, gleicher Seed).',
    },
    { kind: 'h1', text: 'Ohne Laser: die Druckvorlage' },
    {
      kind: 'steps',
      items: [
        'Die Druckvorlage (…-template-A4.pdf) in Originalgröße drucken („Tatsächliche Größe“, nicht „An Seite anpassen“) und den Maßstab auf einem Blatt mit dem Lineal prüfen.',
        'Die Blätter an den Markierungen zusammenkleben und mit Kreppband auf dem Holz befestigen.',
        'Jeden Nagelpunkt mit einem Körner oder Nagel durch das Papier ins Holz anstechen, dann wie oben bohren.',
        'Die Beschriftung mit Bleistift und Stift übertragen oder die Vorlage aufgeklebt lassen und lackieren.',
      ],
    },
    { kind: 'page' },
    { kind: 'h1', text: 'Die Bretter' },
    figure(
      exFigure,
      170,
      `Exzellenzstrategie 2026–2033: ${ex.places} Orte auf ${ex.size}, Start und Ziel Ruhr Innovation Lab (Laserdatei, Farben wie in der Tabelle; zum Lasern quer gedreht).`,
    ),
    figure(
      wo.svg,
      170,
      `Rund um die Welt: ${wo.places} Städte auf ${wo.size}, Start Los Angeles, Ziel Sydney mit der Skala; der gestrichelte Pazifikflug ist vorgegeben.`,
    ),
    figure(
      inc.svg,
      120,
      `Schritt für Schritt: ${inc.nails} Nägel auf ${inc.size}, die Messstrecke am Rand.`,
    ),
    { kind: 'h1', text: 'Checkliste' },
    {
      kind: 'checks',
      items: [
        'Nägel und Faden gemessen, Brett-Dateien neu exportiert (Testbrett: gleicher Seed)',
        'Reststück: Testarray gelasert, beste Werte in die Tabelle eingetragen, Bohrtiefe und Öl getestet',
        'Holz abgeklebt, Datei in Originalgröße, Farben mit den getesteten Werten zugewiesen',
        'Datei mit der Kamera mittig ausgerichtet, Rahmen abgefahren',
        'Graviert, Bohrmulden, geritzt, Umriss',
        'Band abgezogen, alle Löcher 1,5 mm und etwa 9 mm tief gebohrt (Testbrett: auch die Eckstifte)',
        'Geschliffen, geölt, getrocknet',
        'Nägel mit der Mutter M14 auf 11 mm gesetzt, alle senkrecht',
        'Faden nach dem Lösungsblatt kalibriert, Zielmarke gesetzt',
        'Mit der zweitkürzesten Rundreise an der Skala bzw. der Messstrecke geprüft',
        'Lösungsblatt sicher verwahrt (nicht am Stand auslegen)',
      ],
    },
  ];
  return {
    title: 'Bauanleitung TSP-Bretter',
    logos,
    header: 'TSP Boards · Lehrstuhl 11 Algorithm Engineering, TU Dortmund',
    footer: 'Bauanleitung TSP-Bretter',
    blocks,
  };
}

// --- the booth guide ------------------------------------------------------------------------------

function boothGuide(logos: PrintDocument['logos']): PrintDocument {
  const kiosk = `${TSP_URL}#kiosk`;
  const blocks: Block[] = [
    {
      kind: 'title',
      text: 'Messestand: TSP Boards',
      subtitle: `Aufbau und Betrieb am Tag der offenen Tür, und was die App sonst noch kann · Stand ${TODAY}`,
    },
    { kind: 'h1', text: 'Auf einen Blick' },
    {
      kind: 'bullets',
      items: [
        `Die App: ${TSP_URL} (läuft ganz im Browser, nach dem ersten Besuch auch ohne Internet).`,
        'Pro Spiel zwei Laptops, jeder mit eigener Bestenliste (keine Verbindung zwischen den Laptops). Ein Tisch-Schild in der Adresse zeigt, welche Bestenliste zu welchem Laptop gehört.',
        `Laptop 1: ${kiosk}?table=1 · Laptop 2: ${kiosk}?table=2`,
        `Bestenliste auf einem zweiten Bildschirm (freiwillig): ${TSP_URL}#kiosk/scores?table=1`,
      ],
    },
    { kind: 'h1', text: 'Vorbereitung (vorher, mit Internet)' },
    {
      kind: 'steps',
      items: [
        'Auf jedem Laptop Google Chrome installieren bzw. aktualisieren und immer dasselbe Chrome-Profil benutzen (kein Inkognito-Fenster).',
        'Die Kiosk-Adresse des Laptops einmal mit Internet öffnen und warten, bis die Startseite mit den drei Stufen erscheint. Dabei lädt der Browser die ganze App mit Karten, Puzzles und Rechenkern herunter.',
        'Probe: WLAN ausschalten, die Seite neu laden und ein Puzzle anspielen. Es muss alles funktionieren.',
        'In den Energieoptionen von Windows Bildschirmschoner und Ruhezustand am Netzteil ausschalten.',
      ],
    },
    { kind: 'h1', text: 'Kiosk starten (Windows, von Kevin getestet)' },
    {
      kind: 'steps',
      items: [
        'Alle Chrome-Fenster schließen. In den Chrome-Einstellungen unter „System“ den Schalter „Apps im Hintergrund weiter ausführen, wenn Google Chrome geschlossen ist“ ausschalten, damit kein Chrome im Hintergrund weiterläuft.',
        'Win+R drücken und eingeben (Tisch 1; für Tisch 2 „table=2“):',
      ],
    },
    { kind: 'code', text: `chrome --kiosk "${kiosk}?table=1"` },
    {
      kind: 'p',
      text: 'Findet Windows „chrome“ nicht, den vollen Pfad nehmen:',
    },
    {
      kind: 'code',
      text: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk "${kiosk}?table=1"`,
    },
    {
      kind: 'steps',
      start: 3,
      items: [
        'Alt+F4 beendet den Kiosk.',
        'Wichtig: Die Bestenliste gehört zu diesem Chrome-Profil und genau dieser Adresse. Also immer dasselbe Profil, dieselbe Adresse (mit demselben Tisch) und keine Browserdaten löschen.',
      ],
    },
    { kind: 'h2', text: 'Zweiter Bildschirm (freiwillig)' },
    {
      kind: 'p',
      text: `Ein zweites Chrome-Fenster desselben Profils mit ${TSP_URL}#kiosk/scores?table=1 auf den zweiten Bildschirm ziehen und mit F11 auf Vollbild stellen. Es zeigt die Bestenlisten des Tages und liest sie alle 10 Sekunden neu.`,
    },
    { kind: 'h1', text: 'Während des Tages' },
    {
      kind: 'bullets',
      items: [
        'Die Startseite zeigt drei Stufen (leicht, mittel, schwer) und das Tisch-Schild.',
        'Namen: Jede Person bekommt einen Tiernamen mit Zahl („Fuchs 7“), der heute noch frei ist; „Anderer Name“ wählt einen neuen. Es gibt kein Textfeld am Stand. Für betreute Gruppen schaltet „&names=free“ in der Adresse das Namensfeld ein.',
        '„Nächste Person“ beginnt das Spiel neu mit neuem Namen, „Zur Auswahl“ geht zu den Stufen. Nach zwei Minuten ohne Berührung kehrt der Kiosk von selbst zur Startseite zurück; wer aufgehört hat, steht trotzdem mit seinem besten Ergebnis in der Liste.',
        'Nach einem Spiel erklärt „So rechnet der Computer“, wie einfache Strategien abschneiden und wie der Computer die kürzeste Rundreise findet und beweist (eine kurze Animation, ein Tippen überspringt sie).',
        'Eintrag entfernen (z. B. ein unpassender Name): den Eintrag in der Bestenliste 1,5 Sekunden gedrückt halten (oder auswählen und Umschalt+Entf), dann „Entfernen“ bestätigen.',
      ],
    },
    { kind: 'h1', text: 'Wenn etwas schiefgeht' },
    {
      kind: 'table',
      header: true,
      widths: [0.4, 0.6],
      rows: [
        ['Problem', 'Lösung'],
        ['Seite weiß oder hängt', 'Alt+F4, dann wie oben mit Win+R neu starten.'],
        [
          'Seite lädt ohne Internet nicht',
          'Sie wurde auf diesem Laptop noch nie online geöffnet: kurz ein Netz (z. B. Handy-Hotspot) einschalten und die Adresse einmal laden. Notfalls die lokale Fassung (docs/deployment.md).',
        ],
        [
          'Bestenliste ist leer',
          'Anderes Chrome-Profil, Inkognito oder eine andere Adresse (anderer Tisch): mit derselben Adresse im gewohnten Profil starten. Gezeigt werden nur die Ergebnisse von heute.',
        ],
        [
          'Kiosk lässt sich nicht verlassen',
          'Alt+F4. Ohne Kiosk-Modus: die Adresse ohne „#kiosk“ laden.',
        ],
        [
          'Bildschirm geht aus',
          'Energieoptionen: Ruhezustand und Bildschirmabschaltung am Netzteil auf „Nie“.',
        ],
        ['Neue App-Version', 'Kommt von selbst, aber nur auf der Startseite, nie mitten im Spiel.'],
      ],
    },
    { kind: 'h1', text: 'Was die App sonst noch kann' },
    {
      kind: 'bullets',
      items: [
        'Galerie: alle fertigen Puzzles nach Kategorien (Deutschland, Städte und Regionen, Europa und die Welt, Schritt für Schritt, Specials), als Brett oder digital, mit Bestleistungen in diesem Browser.',
        'Am Handy spielen: Die QR-Codes auf den Plakaten und Karten öffnen ein Puzzle direkt, z. B. ls11ae.github.io/tsp-boards/#p/deutschland-40 (#p/ und die Puzzle-Kennung).',
        'Puzzle-Designer („Karten-Puzzle“): Land und Region wählen, die Suche erzeugt neue Puzzles mit großem Abstand zur zweitbesten Rundreise; eigene Ortslisten, Orte festlegen oder ausschließen, Orte zusammenfassen.',
        'Export: das Brett (SVG für den Laser, Druckvorlage, Lösungsblatt), Plakate in A4 bis A0 und B2 bis B0 und ein Arbeitsblatt für den Unterricht.',
        'Lehrmodus „Strategien ansehen“: nächster Nachbar, Einfügen, kürzeste Kanten zuerst, 2-opt und der exakte Löser Schritt für Schritt.',
        'Globus und Weltpuzzles: Rundreisen auf der Kugel (Großkreise), ein drehbarer Globus und ein Flug entlang der Rundreise.',
        'Schritt für Schritt: das inkrementelle Puzzle (Nägel 1–3, 1–4, … nacheinander).',
        'Alles auf Deutsch und Englisch (EN/DE oben rechts).',
      ],
    },
    { kind: 'qr', url: TSP_URL, caption: 'TSP Boards im Browser' },
  ];
  return {
    title: 'Messestand TSP Boards',
    logos,
    header: 'TSP Boards · Lehrstuhl 11 Algorithm Engineering, TU Dortmund',
    footer: 'Messestand TSP Boards',
    blocks,
  };
}

// --- the cards ------------------------------------------------------------------------------------

/** A mini map of a puzzle: the country outline, the places and the shortest round trip. */
function miniMap(id: string): MiniMap {
  const doc = puzzle(id);
  const map = doc.map!;
  const country = loadCountry(doc.data?.country ?? map.params.region.slice(0, 2));
  const towns = new Map(citiesFromColumns(country.cities, country.states).map((c) => [c.id, c]));
  const pool = map.list ? listCities(map.places, towns) : null;
  const ids = map.places.map((p) => p.id!);
  const params = { ...DEFAULT_PARAMS, ...map.params };
  const setup = boardSetup(country, params, ids, localText(doc.title, 'de'), pool);
  const { boardWidthMm: w, boardHeightMm: h } = params;
  const lines = boardMapLines(country, params.region, setup.projection, [0, 0, w, h]).strong;
  return {
    width: w,
    height: h,
    lines,
    points: setup.points,
    tour: map.results!.tour,
  };
}

// --- writing -----------------------------------------------------------------------------------

function readLogo(name: string): Logo | null {
  const file = path.join(LOGO_DIR, name);
  return existsSync(file) ? parseSvgColorLogo(read(file)) : null;
}

function write(dir: string, name: string, pdf: Uint8Array): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), pdf);
  console.error(`wrote ${path.join(dir, name)}`);
}

function main(): void {
  const tu = readLogo('tu-dortmund.svg');
  const faculty = readLogo('fakultaet-informatik.svg');
  const ae = readLogo('ae-logo.svg');
  const map = miniMap('deutschland-40');
  const exBoard = 'docs/boards/exzellenzstrategie-2027/exzellenzstrategie-2027.svg';
  const variants: {
    dir: string;
    logos: PrintDocument['logos'];
    cards: (Logo | null)[];
    exFigure: string;
  }[] = [{ dir: OUT, logos: undefined, cards: [], exFigure: exBoard }];
  if (tu || faculty || ae)
    variants.push({
      dir: LOGO_OUT,
      logos: { left: tu, right: ae },
      cards: [tu, faculty, ae],
      exFigure: existsSync(EX_LOGO_BOARD) ? EX_LOGO_BOARD : exBoard,
    });
  else console.error(`no logos in ${LOGO_DIR}: only the neutral versions`);
  for (const v of variants) {
    write(v.dir, 'bauanleitung.pdf', documentPdf(buildingGuide(v.logos, v.exFigure)).pdf);
    write(v.dir, 'messestand.pdf', documentPdf(boothGuide(v.logos)).pdf);
    write(v.dir, 'karten.pdf', cardsPdf({ map, logos: v.cards }).pdf);
  }
  console.error(`QR codes: ${TSP_URL}, ${RULER_URL}`);
}

main();
