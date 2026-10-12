// The board in board millimetres: map layers, candidate cities, nails, labels and the tour.
// d3 computed the path strings; React renders the SVG. Clicking near a city cycles it through
// pinned → excluded → neutral.

import { memo, useMemo, useRef, type MouseEvent } from 'react';
import type { Point } from '../../core/geometry';
import type { BoardModel } from '../board';
import { cycleCity } from '../controller';
import { planKey, previewPaths } from '../export';
import { playClick } from '../play';
import { getLabels, placeBoardLabels } from '../labels';
import { useOverlay, type OverlayView } from '../overlay';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { boardFit } from './fit';

/** Nails are drawn at least this large (mm) so they stay visible on screen. */
const MIN_VISUAL_RADIUS_MM = 3;
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

/** The comparison tour: dashed, its own edges solid, the optimal edges it leaves out marked. */
function Overlay({
  board,
  overlay,
  showRemoved,
}: {
  readonly board: BoardModel;
  readonly overlay: OverlayView;
  readonly showRemoved: boolean;
}) {
  const at = (c: number) => board.points[c]!.map((v) => v.toFixed(2)).join(',');
  const edges = (list: OverlayView['added']) => list.map(([a, b]) => `M${at(a)}L${at(b)}`).join('');
  return (
    <g>
      {showRemoved && <path className="overlay-removed" d={edges(overlay.removed)} />}
      <polygon className="overlay-tour" points={overlay.tour.map(at).join(' ')} />
      <path className="overlay-added" d={edges(overlay.added)} />
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
  const params = useStore((s) => s.params);
  const mode = useStore((s) => s.mode);
  const play = useStore((s) => s.play);
  const playing = mode === 'play';
  const nailDiameter = params.nailDiameterMm;
  const lang = useStore((s) => s.lang);
  const labels = getLabels(board, params);
  const members = puzzle?.members;
  const exportOptions = useStore((s) => s.exportOptions);
  const planState = useStore((s) =>
    puzzle ? s.boardPlans[planKey(puzzle.key, s.params)] : undefined,
  );
  const plan = planState?.status === 'done' ? planState.plan : null;
  const preview =
    plan && puzzle && exportOptions.preview
      ? previewPaths(board, puzzle, plan, exportOptions.holes)
      : null;
  const placed = useMemo(
    () => (labels && members ? placeBoardLabels(board, labels, members).labels : []),
    [board, labels, members],
  );
  const { widthMm, heightMm } = board.projection.board;
  const nailRadius = nailDiameter / 2;
  const showSolution = playing ? play.revealed : showTour;
  const tourPoints =
    puzzle?.tour && showSolution
      ? puzzle.tour.map((c) => board.points[c]!.map((v) => v.toFixed(2)).join(',')).join(' ')
      : null;
  const pathPoints =
    playing && puzzle
      ? play.state.path
          .map((s) => board.points[puzzle.members[s]!]!.map((v) => v.toFixed(2)).join(','))
          .join(' ')
      : null;
  const visited = new Set(playing ? play.state.path : []);
  // Players see comparisons once the puzzle is solved or the solution revealed.
  const overlay = useOverlay(board, puzzle);
  const showOverlay = overlay && (!playing || play.revealed || play.solvedMs !== null);

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (playing) {
      if (!puzzle) return;
      let slot = -1;
      let nearest = CLICK_RADIUS_MM * 1.5;
      puzzle.members.forEach((c, s) => {
        const [x, y] = board.points[c]!;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < nearest) {
          nearest = d;
          slot = s;
        }
      });
      if (slot >= 0) playClick(puzzle, slot);
      return;
    }
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
      style={boardFit(widthMm, heightMm)}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      role="img"
      aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
      onClick={onClick}
    >
      {preview ? (
        <g className="preview">
          <rect className="board-bg" width={widthMm} height={heightMm} />
          <path className="lay-score" d={preview.score} />
          <path className="lay-outline" d={preview.outline} />
          <path className="lay-engrave" d={preview.engrave} />
          <path className="lay-cut" d={preview.cut} />
        </g>
      ) : (
        <>
          <MapLayers board={board} />
          {!playing && <PoolDots points={board.points} />}
        </>
      )}
      {tourPoints && <polygon className="tour" points={tourPoints} />}
      {showOverlay && <Overlay board={board} overlay={overlay} showRemoved={tourPoints !== null} />}
      {pathPoints &&
        (play.state.closed ? (
          <polygon className="play-path" points={pathPoints} />
        ) : (
          <polyline className="play-path" points={pathPoints} />
        ))}
      {!playing && <Marks board={board} />}
      {/* Board labels are a board property (label language), not the UI language. */}
      {!preview && (
        <g className="labels">
          {placed.map((l) => (
            <path key={l.city} className={l.fits ? 'label' : 'label label-misfit'} d={l.path} />
          ))}
        </g>
      )}
      {puzzle?.members.map((c, slot) => {
        const [x, y] = board.points[c]!;
        const city = board.pool[c]!;
        const state =
          playing && play.state.path[0] === slot ? ' start' : visited.has(slot) ? ' visited' : '';
        return (
          <g key={c} className={`city${state}`}>
            <title>{`${city.name} (${city.pop.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')})`}</title>
            <circle
              className="nail-halo"
              cx={x}
              cy={y}
              r={Math.max(MIN_VISUAL_RADIUS_MM, nailRadius)}
            />
            <circle className="nail" cx={x} cy={y} r={nailRadius} />
          </g>
        );
      })}
    </svg>
  );
}
