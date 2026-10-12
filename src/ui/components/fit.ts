import type { CSSProperties } from 'react';

/**
 * Width of a board SVG so that it fits the window height: with the box at the viewBox's
 * aspect ratio, nothing outside the board shows (map lines run past the board edge).
 */
export function boardFit(widthMm: number, heightMm: number): CSSProperties {
  return { maxWidth: `calc((100vh - 160px) * ${(widthMm / heightMm).toFixed(4)})` };
}
