// The board in board millimetres: map layers, candidate cities, nails, labels and the tour.
// d3 computed the path strings; React renders the SVG. Clicking near a city cycles it through
// pinned → excluded → neutral.

import { memo, useRef, type MouseEvent } from 'react';
import type { Point } from '../../core/geometry';
import type { BoardModel } from '../board';
import { cycleCity } from '../controller';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

/** Nails are drawn at least this large (mm) so they stay visible on screen. */
const MIN_VISUAL_RADIUS_MM = 3;
const LABEL_SIZE_MM = 9;
/** A click selects the nearest city within this distance (board mm). */
const CLICK_RADIUS_MM = 8;

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

function Marks({ board }: { readonly board: BoardModel }) {
  const pinned = useStore((s) => s.pinned);
  const excluded = useStore((s) => s.excluded);
  const at = (id: number) => {
    const i = board.index.get(id);
    return i === undefined ? null : board.points[i]!;
  };
  return (
    <g>
      {pinned.map((id) => {
        const p = at(id);
        return p && <circle key={`p${id}`} className="pin-mark" cx={p[0]} cy={p[1]} r={6} />;
      })}
      {excluded.map((id) => {
        const p = at(id);
        if (!p) return null;
        const [x, y] = p;
        return (
          <path
            key={`x${id}`}
            className="ex-mark"
            d={`M${x - 3},${y - 3}L${x + 3},${y + 3}M${x - 3},${y + 3}L${x + 3},${y - 3}`}
          />
        );
      })}
    </g>
  );
}

export function BoardMap({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const showTour = useStore((s) => s.showTour);
  const nailDiameter = useStore((s) => s.params.nailDiameterMm);
  const lang = useStore((s) => s.lang);
  const { widthMm, heightMm } = board.projection.board;
  const nailRadius = nailDiameter / 2;
  const tourPoints =
    puzzle?.tour && showTour
      ? puzzle.tour.map((c) => board.points[c]!.map((v) => v.toFixed(2)).join(',')).join(' ')
      : null;

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    let best = -1;
    let bestDist = CLICK_RADIUS_MM;
    board.points.forEach(([x, y], i) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) cycleCity(board.pool[best]!.id);
  };

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      role="img"
      aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
      onClick={onClick}
    >
      <MapLayers board={board} />
      <PoolDots points={board.points} />
      {tourPoints && <polygon className="tour" points={tourPoints} />}
      <Marks board={board} />
      {puzzle?.members.map((c) => {
        const [x, y] = board.points[c]!;
        const city = board.pool[c]!;
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
            {/* Board labels are a board property, not a UI-language choice: German in Phase 1. */}
            <text className="label" x={x + 5} y={y + LABEL_SIZE_MM * 0.35} fontSize={LABEL_SIZE_MM}>
              {city.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
