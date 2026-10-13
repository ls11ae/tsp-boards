// The board in board millimetres: map layers, candidate cities, nails, labels and the tour.
// d3 computed the path strings; React renders the SVG (designer; play mode: PlayBoard).
// Clicking near a city cycles it through pinned → excluded → neutral.

import { memo, useMemo, useRef, type MouseEvent } from 'react';
import { listName } from '../../core/data';
import type { Point } from '../../core/geometry';
import type { BoardModel } from '../board';
import { cycleCity } from '../controller';
import { addHandPoint, removeHandPoint, toggleCombine } from '../lists';
import { planKey, previewPaths } from '../export';
import { getLabels, placeBoardLabels } from '../labels';
import { useOverlay, type OverlayView } from '../overlay';
import type { TeachingFrame } from '../../core/teaching';
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

export const MapLayers = memo(function MapLayers({ board }: { readonly board: BoardModel }) {
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

/** A frame of the teaching mode: the edges so far, the newest emphasised. */
function TeachingLayer({
  board,
  members,
  frame,
}: {
  readonly board: BoardModel;
  readonly members: readonly number[];
  readonly frame: TeachingFrame;
}) {
  const at = (s: number) => board.points[members[s]!]!.map((v) => v.toFixed(2)).join(',');
  const edges = (list: TeachingFrame['edges']) =>
    list.map(([a, b]) => `M${at(a)}L${at(b)}`).join('');
  return (
    <g>
      <path className="teach-edge" d={edges(frame.edges)} />
      <path className="teach-hl" d={edges(frame.highlight)} />
      {frame.nodes.map((s) => {
        const [x, y] = board.points[members[s]!]!;
        return <circle key={s} className="teach-node" cx={x} cy={y} r={6} />;
      })}
    </g>
  );
}

/** The comparison tour: dashed, its own edges solid, the optimal edges it leaves out marked. */
export function Overlay({
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
  const placing = useStore((s) => s.placing);
  const combining = useStore((s) => s.combining);
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
  const tourPoints =
    puzzle?.tour && showTour
      ? puzzle.tour.map((c) => board.points[c]!.map((v) => v.toFixed(2)).join(',')).join(' ')
      : null;
  const overlay = useOverlay(board, puzzle);
  const teaching = useStore((s) => s.teaching);
  const teachFrame =
    puzzle && teaching?.key === puzzle.key ? (teaching.frames?.[teaching.index] ?? null) : null;
  const showOverlay = overlay && !teachFrame;

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
    if (combining) {
      // Places of the puzzle on display (or of the list) can be combined.
      if (best >= 0 && (!puzzle || puzzle.members.includes(best))) toggleCombine(best);
      return;
    }
    if (placing) {
      if (best >= 0) removeHandPoint(best);
      else {
        const lonLat = board.projection.invert(p.x, p.y);
        if (lonLat) addHandPoint(lonLat[1], lonLat[0]);
      }
      return;
    }
    if (best >= 0) cycleCity(board.pool[best]!.id);
  };

  return (
    <svg
      ref={svgRef}
      className={placing || combining ? 'board placing' : 'board'}
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
          <PoolDots points={board.points} />
        </>
      )}
      {tourPoints && !teachFrame && <polygon className="tour" points={tourPoints} />}
      {teachFrame && puzzle && (
        <TeachingLayer board={board} members={puzzle.members} frame={teachFrame} />
      )}
      {showOverlay && <Overlay board={board} overlay={overlay} showRemoved={tourPoints !== null} />}
      <Marks board={board} />
      {combining?.map((c) => {
        const [x, y] = board.points[c]!;
        return <circle key={`c${c}`} className="combine-mark" cx={x} cy={y} r={7} />;
      })}
      {/* Board labels are a board property (label language), not the UI language. */}
      {!preview && (
        <g className="labels">
          {placed.map((l) => (
            <path key={l.city} className={l.fits ? 'label' : 'label label-misfit'} d={l.path} />
          ))}
        </g>
      )}
      {puzzle?.members.map((c) => {
        const [x, y] = board.points[c]!;
        const city = board.pool[c]!;
        return (
          <g key={c} className="city">
            <title>
              {city.members
                ? listName(city, lang)
                : `${city.name} (${city.pop.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')})`}
            </title>
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
