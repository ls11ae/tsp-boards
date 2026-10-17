import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { shortLink, shortLinkId } from '../permalink';
import { QR_QUIET, qrMatrix, qrPath } from './qr';

/** The code as a grey image (4 pixels per module, quiet zone white) for the decoder. */
function image(matrix: readonly (readonly boolean[])[]): { data: Uint8ClampedArray; size: number } {
  const px = 4;
  const n = matrix.length + 2 * QR_QUIET;
  const size = n * px;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let dy = 0; dy < px; dy++)
        for (let dx = 0; dx < px; dx++) {
          const i = (((QR_QUIET + r) * px + dy) * size + (QR_QUIET + c) * px + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return { data, size };
}

describe('QR codes (roadmap 9.10)', () => {
  it('encode the short play link so that a decoder reads it back', () => {
    const url = shortLink('https://ls11ae.github.io/tsp-boards/', 'exzellenzstrategie-2027-37');
    expect(url).toBe('https://ls11ae.github.io/tsp-boards/#p/exzellenzstrategie-2027-37');
    const matrix = qrMatrix(url);
    // Version 5 (37 modules) holds the link at error correction M.
    expect(matrix.length).toBeLessThanOrEqual(37);
    const { data, size } = image(matrix);
    expect(jsQR(data, size, size)?.data).toBe(url);
  });

  it('draws the dark modules inside the code with its quiet zone', () => {
    const matrix = qrMatrix('https://example.org/#p/x');
    const path = qrPath(matrix, 10, 20, 40);
    const xs = path.flatMap((c) => (c[0] === 'M' || c[0] === 'L' ? [c[1]] : []));
    const cell = 40 / (matrix.length + 2 * QR_QUIET);
    expect(Math.min(...xs)).toBeCloseTo(10 + QR_QUIET * cell, 6);
    expect(Math.max(...xs)).toBeCloseTo(50 - QR_QUIET * cell, 6);
  });

  it('reads short links and leaves permalinks alone', () => {
    expect(shortLinkId('#p/exzellenzstrategie-2027-37')).toBe('exzellenzstrategie-2027-37');
    expect(shortLinkId('#v=3&r=DE')).toBeNull();
    expect(shortLinkId('#p/../secret')).toBeNull();
  });
});
