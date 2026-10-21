// DIN paper sizes for posters (roadmap 9.7; B formats since 9.22). Kept apart from the poster
// drawing so the app's panel can offer them without loading the export code.

export type DinPaper = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'B0' | 'B1' | 'B2';
export const DIN_PAPERS: readonly DinPaper[] = ['A0', 'A1', 'A2', 'A3', 'A4', 'B0', 'B1', 'B2'];
/** Short and long side, mm (ISO 216). */
export const DIN_SIZES: Record<DinPaper, readonly [number, number]> = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
  B0: [1000, 1414],
  B1: [707, 1000],
  B2: [500, 707],
};
export type Orientation = 'portrait' | 'landscape';

/** Page width and height, mm. */
export function pageSize(paper: DinPaper, orientation: Orientation): [number, number] {
  const [a, b] = DIN_SIZES[paper];
  return orientation === 'portrait' ? [a, b] : [b, a];
}
