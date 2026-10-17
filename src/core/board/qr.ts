// QR codes on posters (roadmap 9.10): the short play link of the poster's puzzle, so visitors
// can play it on their phones. Encoded locally with qrcode-generator (MIT); no web service.

import qrcode from 'qrcode-generator';
import { rectPath, type PathCommand } from './shapes';

/** Modules of the quiet zone around a code (the QR standard asks for 4). */
export const QR_QUIET = 4;

/** The QR code of a text: dark modules, row by row (error correction M, smallest version). */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  const n = code.getModuleCount();
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => code.isDark(r, c)),
  );
}

/**
 * The dark modules as filled rectangles (runs of a row merged), for a code of `size` mm
 * including its quiet zone, with the top-left corner at (x, y).
 */
export function qrPath(
  matrix: readonly (readonly boolean[])[],
  x: number,
  y: number,
  size: number,
): PathCommand[] {
  const n = matrix.length;
  const cell = size / (n + 2 * QR_QUIET);
  const out: PathCommand[] = [];
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < n) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && row[c]) c++;
      out.push(
        ...rectPath(
          x + (QR_QUIET + start) * cell,
          y + (QR_QUIET + r) * cell,
          (c - start) * cell,
          cell,
        ),
      );
    }
  });
  return out;
}
