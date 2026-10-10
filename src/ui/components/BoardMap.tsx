// The board in board millimetres: map layers, candidate cities, nails, labels and the tour.
// d3 computed the path strings; React renders the SVG.

import { memo } from 'react';
import type { Point } from '../../core/geometry';
import type { BoardModel } from '../board';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

/** Nails are drawn at least this large (mm) so they stay visible on screen. */
const MIN_VISUAL_RADIUS_MM = 3;
const LABEL_SIZE_MM = 9;

const PoolDots = memo(function PoolDots({ points }: { readonly points: readonly Point[] }) {
  return (
    <g className="pool">
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} />
      ))}
    </g>
  );
});

const MapLayers = memo(function MapLayers({ board }: { readonly board: BoardModel }) {
  const { widthMm, heightMm } = board.projection.board;
  return (
    <g>
      <rect className="board-bg" width={widthMm} height={heightMm} />
      <path className="map-neighbors" d={board.paths.neighbors} />
      <path className="map-states" d={board.paths.states} />
      <path className="map-country" d={board.paths.country} />
      {board.paths.region && <path className="map-region" d={board.paths.region} />}
    </g>
  );
});

export function BoardMap({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const showTour = useStore((s) => s.showTour);
  const nailDiameter = useStore((s) => s.params.nailDiameterMm);
  const lang = useStore((s) => s.lang);
  const { widthMm, heightMm } = board.projection.board;
  const nailRadius = nailDiameter / 2;
  const tourPoints =
    puzzle?.tour && showTour
      ? puzzle.tour.map((c) => board.points[c]!.map((v) => v.toFixed(2)).join(',')).join(' ')
      : null;
  return (
    <svg
      className="board"
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      role="img"
      aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
    >
      <MapLayers board={board} />
      <PoolDots points={board.points} />
      {tourPoints && <polygon className="tour" points={tourPoints} />}
      {puzzle?.members.map((c) => {
        const [x, y] = board.points[c]!;
        const city = board.pool[c]!;
        // Board labels are a board property, not a UI-language choice: German in Phase 1.
        const name = city.label;
        return (
          <g key={c} className="city">
            <title>{`${city.name} (${city.pop.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')})`}</title>
            <circle
              className="nail-halo"
              cx={x}
              cy={y}
              r={Math.max(MIN_VISUAL_RADIUS_MM, nailRadius)}
            />
            <circle className="nail" cx={x} cy={y} r={nailRadius} />
            <text className="label" x={x + 5} y={y + LABEL_SIZE_MM * 0.35} fontSize={LABEL_SIZE_MM}>
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
