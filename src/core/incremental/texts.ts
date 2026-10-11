// Texts on the incremental board and its sheets (board language).

import type { LabelLanguage } from '../data';
import type { Paper } from '../board/print';

export interface IncrementalTexts {
  readonly boardLine: (n: number) => string;
  readonly templateTitle: string;
  readonly templateSteps: (info: { nailMm: number; pages: number; paper: Paper }) => string[];
  readonly tile: (name: string, row: number, col: number) => string;
  readonly checkBar: string;
  readonly solutionTitle: (n: number) => string;
  readonly solutionWarning: string;
  readonly tableHead: readonly [string, string, string, string, string];
  readonly calibrationTitle: string;
  readonly calibrationSteps: (info: { n: number; cutMm: string; tour: string }) => string[];
  readonly link: string;
}

export const INCREMENTAL_TEXTS: Record<LabelLanguage, IncrementalTexts> = {
  de: {
    boardLine: (n) =>
      `TSP Schritt für Schritt: Finde die kürzeste Rundreise durch die Nägel 1–3, dann 1–4, … bis 1–${n}.`,
    templateTitle: 'TSP Schritt für Schritt: Druckvorlage im Maßstab 1:1',
    templateSteps: ({ nailMm, pages, paper }) => [
      `1. Die ${pages} Kachelseiten auf ${paper} in Originalgröße drucken (100 %, nicht „an Seite anpassen“). Der Kontrollbalken oben rechts muss genau 50 mm lang sein.`,
      '2. Kacheln wie in der Übersicht anordnen, bei jeder Kachel außer in der ersten Zeile und Spalte den Rand oben und links an der gestrichelten Linie abschneiden und aufkleben.',
      `3. Vorlage auf die Holzplatte kleben und zuschneiden. An jedem Kreuz einen Nagel (${nailMm} mm) einschlagen, auch an den vier Ecken der Messstrecke.`,
      '4. Den Faden mit einer lockeren Schlaufe an Nagel 1 befestigen und nach dem Lösungsblatt kalibrieren.',
    ],
    tile: (name, row, col) => `Kachel ${name} · Zeile ${row}, Spalte ${col}`,
    checkBar: '50 mm',
    solutionTitle: (n) => `Lösung: TSP Schritt für Schritt (${n} Nägel)`,
    solutionWarning: 'Nur für die Person, die das Brett baut – nicht den Mitspielenden zeigen.',
    tableHead: ['k', 'Kürzeste Rundreise durch 1–k', 'Faden', 'Lücke', 'an der Strecke'],
    calibrationTitle: 'Faden kalibrieren',
    calibrationSteps: ({ n, cutMm, tour }) => [
      `1. Faden auf mindestens ${cutMm} mm zuschneiden und mit einer lockeren Schlaufe um Nagel 1 legen.`,
      `2. Die Rundreise durch alle ${n} Nägel genau in dieser Reihenfolge wickeln: ${tour}. Dann um Nagel 1 herum zur nächsten Ecke und den Faden straff im Uhrzeigersinn um die Ecknägel entlang der Messstrecke legen.`,
      `3. Den Faden genau an der Marke „${n}“ markieren oder dort einen Knoten bzw. eine Perle setzen; den Rest abschneiden.`,
      'Damit endet der Faden bei der kürzesten Rundreise durch 1–k (in beliebiger Richtung) im Feld der Marke k; jede andere Rundreise durch 1–k endet mindestens um die angegebene Lücke früher.',
    ],
    link: 'Puzzle-Link (stellt dieses Brett in der App wieder her)',
  },
  en: {
    boardLine: (n) =>
      `TSP step by step: find the shortest round trip through nails 1–3, then 1–4, … up to 1–${n}.`,
    templateTitle: 'TSP step by step: print template at 1:1 scale',
    templateSteps: ({ nailMm, pages, paper }) => [
      `1. Print the ${pages} tile pages on ${paper} at actual size (100 %, not "fit to page"). The check bar at the top right must be exactly 50 mm long.`,
      '2. Arrange the tiles as in the overview; on every tile except those in the first row and column, cut off the top and left margin along the dashed line and glue it on.',
      `3. Glue the template onto the wooden board and cut it. Drive a nail (${nailMm} mm) into every cross, including the four corners of the measuring track.`,
      '4. Attach the string to nail 1 with a loose loop and calibrate it as described on the solution sheet.',
    ],
    tile: (name, row, col) => `Tile ${name} · row ${row}, column ${col}`,
    checkBar: '50 mm',
    solutionTitle: (n) => `Solution: TSP step by step (${n} nails)`,
    solutionWarning: 'For the person building the board only – do not show it to the players.',
    tableHead: ['k', 'Shortest round trip through 1–k', 'String', 'Gap', 'at the track'],
    calibrationTitle: 'Calibrating the string',
    calibrationSteps: ({ n, cutMm, tour }) => [
      `1. Cut the string to at least ${cutMm} mm and put it around nail 1 with a loose loop.`,
      `2. Wind the round trip through all ${n} nails in exactly this order: ${tour}. Then go around nail 1 to the nearest corner and lay the string taut clockwise around the corner nails along the measuring track.`,
      `3. Mark the string exactly at mark "${n}", or tie a knot or bead there; cut off the rest.`,
      'For the shortest round trip through 1–k (either direction) the string then ends in the field of mark k; every other round trip through 1–k ends at least the listed gap earlier.',
    ],
    link: 'Puzzle link (restores this board in the app)',
  },
};
