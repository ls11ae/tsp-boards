// Texts printed on the board and the sheets, in the board's label language (a board property,
// independent of the UI language).

import type { LabelLanguage } from '../data';

export interface BoardTexts {
  /** Subtitle under the title; `places`: "Orte" (a place list) instead of "Städte". */
  readonly subtitle: (n: number, places: boolean) => string;
  /** Caption along the scale. */
  readonly scaleCaption: string;
  readonly attribution: string;
  // Print template.
  readonly templateTitle: (region: string) => string;
  readonly templateSteps: (info: { nailMm: number; pages: number; paper: string }) => string[];
  readonly tile: (name: string, row: number, col: number) => string;
  readonly checkBar: string;
  // Solution sheet.
  readonly solutionTitle: (region: string) => string;
  readonly solutionWarning: string;
  readonly tourOrder: string;
  readonly figures: string;
  readonly stringLength: (mm: string) => string;
  readonly centreLength: (mm: string) => string;
  readonly measuredLength: (mm: string, targetMm: string) => string;
  readonly gap: (mm: string) => string;
  readonly measuredGap: (mm: string, exact: boolean) => string;
  readonly calibrationTitle: string;
  readonly calibrationSteps: (info: { gapMm: string; cutMm: string }) => string[];
  readonly puzzleLink: string;
  // Classroom worksheet.
  readonly worksheetTask: (n: number) => string;
  readonly worksheetName: string;
  readonly worksheetLength: (km: string) => string;
  readonly worksheetSecond: (km: string) => string;
}

export const BOARD_TEXTS: Record<LabelLanguage, BoardTexts> = {
  de: {
    subtitle: (n, places) => `${n} ${places ? 'Orte' : 'Städte'} · Finde die kürzeste Rundreise!`,
    scaleCaption: 'mm Faden zu viel',
    attribution: 'Städte: GeoNames (CC BY 4.0) · Grenzen: Natural Earth · TSP Boards',
    templateTitle: (region) => `TSP-Brett ${region}: Druckvorlage im Maßstab 1:1`,
    templateSteps: ({ nailMm, pages, paper }) => [
      `1. Die ${pages} Kachelseiten auf ${paper} in Originalgröße drucken (100 %, nicht „an Seite anpassen“). Der Kontrollbalken oben rechts muss genau 50 mm lang sein.`,
      '2. Kacheln wie in der Übersicht anordnen. Bei jeder Kachel außer in der ersten Zeile und Spalte den Rand oben und links an der gestrichelten Linie abschneiden und auf die Nachbarkacheln kleben, sodass die Zeichnung deckungsgleich ist.',
      `3. Vorlage auf die Holzplatte kleben und an der Außenlinie zuschneiden. An jedem Kreuz einen Nagel (${nailMm} mm) senkrecht einschlagen.`,
      '4. Den Faden mit einer lockeren Schlaufe am Startnagel (doppelter Kreis an der Skala) befestigen und nach dem Lösungsblatt kalibrieren.',
    ],
    tile: (name, row, col) => `Kachel ${name} · Zeile ${row}, Spalte ${col}`,
    checkBar: '50 mm',
    solutionTitle: (region) => `Lösung: ${region}`,
    solutionWarning: 'Nur für die Person, die das Brett baut – nicht den Mitspielenden zeigen.',
    tourOrder: 'Kürzeste Rundreise ab dem Startnagel',
    figures: 'Kennzahlen',
    stringLength: (mm) => `Fadenlänge der Rundreise (mit Nagelkorrektur): ${mm} mm`,
    centreLength: (mm) => `Länge zwischen den Nagelmitten: ${mm} mm`,
    measuredLength: (mm, targetMm) =>
      `Faden von der Schlaufe bis zur Zielmarke: etwa ${mm} mm (davon ${targetMm} mm auf der Skala)`,
    gap: (mm) => `Abstand zur zweitkürzesten Rundreise: ${mm} mm Faden`,
    measuredGap: (mm, exact) =>
      `An der Skala endet jede andere Rundreise mindestens ${mm} mm vor der Zielmarke${exact ? '' : ' (Schranke)'}.`,
    calibrationTitle: 'Faden kalibrieren',
    calibrationSteps: ({ gapMm, cutMm }) => [
      `1. Faden auf mindestens ${cutMm} mm zuschneiden und mit einer lockeren Schlaufe um den Startnagel legen.`,
      '2. Die Rundreise oben wickeln (Richtung egal), zurück zum Startnagel, einmal um ihn herum und den Faden straff entlang der Skala legen.',
      '3. Den Faden genau an der Zielmarke „0“ markieren oder dort einen Knoten bzw. eine Perle setzen; den Rest abschneiden.',
      `Damit erreicht das Fadenende bei der kürzesten Rundreise die 0; jede andere Rundreise endet mindestens ${gapMm} mm davor. Die Zahlen der Skala zeigen, wie viele mm Faden eine Lösung zu viel braucht.`,
    ],
    puzzleLink: 'Puzzle-Link (stellt dieses Brett in der App wieder her)',
    worksheetTask: (n) =>
      `Finde die kürzeste Rundreise durch alle ${n} Orte: Sie besucht jeden Ort genau einmal und kehrt zum Start zurück. Zeichne sie mit geraden Linien ein.`,
    worksheetName: 'Name: ______________________    Datum: ____________',
    worksheetLength: (km) => `Kürzeste Rundreise: ${km} km (Luftlinie zwischen den Orten).`,
    worksheetSecond: (km) => `Die zweitkürzeste Rundreise ist ${km} km länger.`,
  },
  en: {
    subtitle: (n, places) => `${n} ${places ? 'places' : 'cities'} · Find the shortest round trip!`,
    scaleCaption: 'mm of string too many',
    attribution: 'Cities: GeoNames (CC BY 4.0) · Borders: Natural Earth · TSP Boards',
    templateTitle: (region) => `TSP board ${region}: print template at 1:1 scale`,
    templateSteps: ({ nailMm, pages, paper }) => [
      `1. Print the ${pages} tile pages on ${paper} at actual size (100 %, not "fit to page"). The check bar at the top right must be exactly 50 mm long.`,
      '2. Arrange the tiles as in the overview. On every tile except those in the first row and column, cut off the top and left margin along the dashed line and glue the tile onto its neighbours so that the drawing lines up.',
      `3. Glue the template onto the wooden board and cut the board along the outer line. Drive a nail (${nailMm} mm) straight into every cross.`,
      '4. Attach the string to the start nail (double circle at the scale) with a loose loop and calibrate it as described on the solution sheet.',
    ],
    tile: (name, row, col) => `Tile ${name} · row ${row}, column ${col}`,
    checkBar: '50 mm',
    solutionTitle: (region) => `Solution: ${region}`,
    solutionWarning: 'For the person building the board only – do not show it to the players.',
    tourOrder: 'Shortest round trip from the start nail',
    figures: 'Figures',
    stringLength: (mm) => `String length of the round trip (with nail correction): ${mm} mm`,
    centreLength: (mm) => `Length between nail centres: ${mm} mm`,
    measuredLength: (mm, targetMm) =>
      `String from the loop to the target mark: about ${mm} mm (${targetMm} mm of it on the scale)`,
    gap: (mm) => `Gap to the second-shortest round trip: ${mm} mm of string`,
    measuredGap: (mm, exact) =>
      `On the scale every other round trip ends at least ${mm} mm before the target mark${exact ? '' : ' (bound)'}.`,
    calibrationTitle: 'Calibrating the string',
    calibrationSteps: ({ gapMm, cutMm }) => [
      `1. Cut the string to at least ${cutMm} mm and put it around the start nail with a loose loop.`,
      '2. Wind the round trip above (either direction), back to the start nail, once around it, and lay the string taut along the scale.',
      '3. Mark the string exactly at the target mark "0", or tie a knot or bead there; cut off the rest.',
      `The end of the string then reaches 0 for the shortest round trip; every other round trip ends at least ${gapMm} mm before it. The numbers on the scale tell how many mm of string a solution uses too many.`,
    ],
    puzzleLink: 'Puzzle link (restores this board in the app)',
    worksheetTask: (n) =>
      `Find the shortest round trip through all ${n} places: it visits every place exactly once and returns to the start. Draw it with straight lines.`,
    worksheetName: 'Name: ______________________    Date: ____________',
    worksheetLength: (km) => `Shortest round trip: ${km} km (straight lines between the places).`,
    worksheetSecond: (km) => `The second-shortest round trip is ${km} km longer.`,
  },
};

/** Texts of a poster (roadmap 9.7), in the poster's language. */
export interface PosterTexts {
  /** Caption under the length: what the length is. */
  readonly lengthCaption: (n: string) => string;
  readonly places: string;
  readonly tours: string;
  readonly second: string;
  /** How the round trip was found and proven shortest. */
  readonly proof: string;
  /** Composite places as one stop at the centre of their members. */
  readonly centroid: string;
  /** Legend line of a group: the members of an alliance as separate stops. */
  readonly groupLegend: string;
  /** Legend line for marked places if the puzzle brings none. */
  readonly markedLegend: string;
  readonly chair: string;
  readonly attribution: string;
}

export const POSTER_TEXTS: Record<LabelLanguage, PosterTexts> = {
  de: {
    lengthCaption: (n) => `ist die kürzeste Rundreise durch alle ${n} Orte (Luftlinie).`,
    places: 'Orte',
    tours: 'mögliche Rundreisen',
    second: 'länger ist die zweitkürzeste Rundreise',
    proof:
      'Die Rundreise wurde mit ganzzahliger linearer Optimierung (Löser HiGHS) berechnet und als kürzeste bewiesen: Keine andere Rundreise durch diese Orte ist kürzer.',
    centroid:
      'Ein Verbund mit Universitäten in mehreren Städten ist ein Halt in der Mitte seiner Standorte; bis dorthin wird gemessen.',
    groupLegend: 'Verbund: jeder Standort ist ein eigener Halt',
    markedLegend: 'markierter Ort',
    chair: 'Lehrstuhl 11 Algorithm Engineering, TU Dortmund',
    attribution: 'Städte: GeoNames (CC BY 4.0) · Grenzen: Natural Earth · TSP Boards',
  },
  en: {
    lengthCaption: (n) => `is the shortest round trip through all ${n} places (as the crow flies).`,
    places: 'places',
    tours: 'possible round trips',
    second: 'longer is the second-shortest round trip',
    proof:
      'The round trip was computed with integer linear optimisation (solver HiGHS) and proven shortest: no other round trip through these places is shorter.',
    centroid:
      'An alliance with universities in several cities is one stop at the centre of its sites; lengths are measured to there.',
    groupLegend: 'alliance: every site is a stop of its own',
    markedLegend: 'marked place',
    chair: 'Chair 11 Algorithm Engineering, TU Dortmund',
    attribution: 'Cities: GeoNames (CC BY 4.0) · Borders: Natural Earth · TSP Boards',
  },
};
