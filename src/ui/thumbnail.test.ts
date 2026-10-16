import { describe, expect, it } from 'vitest';
import { thumbnailView } from './thumbnail';

describe('gallery thumbnails', () => {
  it('show the whole board, or crop to a small cluster of places (roadmap 9.8)', () => {
    // Places across a 600 × 800 board: the whole board.
    expect(
      thumbnailView(
        [
          [50, 60],
          [500, 700],
        ],
        600,
        800,
      ),
    ).toEqual({ x: 0, y: 0, w: 600, h: 800 });
    // The Ruhr area on the board of North Rhine-Westphalia: the places with a margin.
    expect(
      thumbnailView(
        [
          [200, 340],
          [300, 360],
          [250, 400],
        ],
        600,
        800,
      ),
    ).toEqual({ x: 180, y: 320, w: 140, h: 100 });
  });
});
