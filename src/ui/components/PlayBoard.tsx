// The board in play mode (roadmap 7.3): places and labels at a fixed screen size, whatever the
// board's millimetres; the view starts fitted to the places and can be zoomed (buttons, wheel,
// pinch) and panned (drag). Clicks pick the nearest place within a finger-sized radius.

import { useMemo, type CSSProperties } from 'react';
import { boardLabel, listName } from '../../core/data';
import { routePath, type BoardModel } from '../board';
import { ViewSwitch } from './WorldGlobe';
import { useT } from '../i18n';
import { useOverlay } from '../overlay';
import { playClick } from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { fitBox, labelSizeMm, MARKER_PX, screenLabels, useZoomView, type View } from '../zoom';
import { MapLayers, Overlay } from './BoardMap';
import { ZoomControls } from './ZoomControls';

/**
 * The places' bounding box with room for labels, inside the board. World maps show the whole
 * map: great-circle legs pass near the poles and leave the map at its edges.
 */
function fitView(board: BoardModel, members: readonly number[]): View {
  const { widthMm: W, heightMm: H } = board.projection.board;
  const pts = members.length > 0 ? members.map((c) => board.points[c]!) : board.points;
  if (pts.length === 0 || board.sphere) return { x: 0, y: 0, w: W, h: H };
  return fitBox(pts, W, H, Math.max(30, 0.08 * Math.max(W, H)));
}

export function PlayBoard({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const play = useStore((s) => s.play);
  const labelLanguage = useStore((s) => s.params.labelLanguage);
  const showLabels = useStore((s) => s.params.labelSizeMm > 0);
  const members = useMemo(() => puzzle?.members ?? [], [puzzle?.members]);
  const { widthMm: W, heightMm: H } = board.projection.board;

  // The view resets to the places whenever the puzzle changes.
  const fitted = useMemo(() => fitView(board, members), [board, members]);
  const { wrapRef, svgRef, view, viewArea, mm, zoomBy, fit, handlers } = useZoomView(
    fitted,
    Math.max(W, H) * 1.5,
    ([px, py], hitMm) => {
      if (!puzzle) return;
      let slot = -1;
      let nearest = hitMm;
      members.forEach((c, s) => {
        const [x, y] = board.points[c]!;
        const d = Math.hypot(x - px, y - py);
        if (d < nearest) {
          nearest = d;
          slot = s;
        }
      });
      if (slot >= 0) playClick(puzzle, slot);
    },
  );

  // Labels at screen size; recomputed in steps of 8 % of the scale.
  const labelMm = labelSizeMm(mm);
  const labels = useMemo(
    () =>
      showLabels
        ? screenLabels(
            members.map((c) => board.points[c]!),
            members.map((c) => boardLabel(board.pool[c]!, labelLanguage)),
            labelMm,
            viewArea,
          ).filter((d): d is string => d !== null)
        : [],
    [board, members, labelLanguage, labelMm, showLabels, viewArea],
  );

  const overlay = useOverlay(board, puzzle);
  const revealed = play.revealed;
  const showOverlay = overlay && (revealed || play.solvedMs !== null);
  const solution = revealed && puzzle?.tour ? routePath(board, puzzle.tour, true) : null;
  // While a comparison is drawn next to the solution, the own tour would be a third one
  // (roadmap 9.6); after solving without the solution shown it is the optimum and stays.
  const path =
    puzzle && !(showOverlay && solution)
      ? routePath(
          board,
          play.state.path.map((s) => puzzle.members[s]!),
          play.state.closed,
        )
      : '';
  const visited = new Set(play.state.path);
  const r = mm(MARKER_PX);

  return (
    <div
      className="play-board"
      ref={wrapRef}
      style={{ '--view-aspect': fitted.w / fitted.h } as CSSProperties}
    >
      <svg
        ref={svgRef}
        className="board"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={puzzle ? puzzle.members.map((c) => board.pool[c]!.name).join(', ') : undefined}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
      >
        <MapLayers board={board} />
        {solution && <path className="solution-tour" d={solution} />}
        {showOverlay && <Overlay board={board} overlay={overlay} showRemoved={solution !== null} />}
        {path && <path className={revealed ? 'play-path dashed' : 'play-path'} d={path} />}
        <g className="play-labels">
          {labels.map((d, i) => (
            <path key={i} className="play-label" d={d} />
          ))}
        </g>
        {members.map((c, slot) => {
          const [x, y] = board.points[c]!;
          const city = board.pool[c]!;
          const state =
            play.state.path[0] === slot ? ' start' : visited.has(slot) ? ' visited' : '';
          return (
            <g key={c} className={`play-place${state}`}>
              <title>{listName(city, labelLanguage)}</title>
              <circle cx={x} cy={y} r={r} />
              {city.highlight && <circle className="mark-ring" cx={x} cy={y} r={r * 1.55} />}
              {state === ' start' && <circle className="start-ring" cx={x} cy={y} r={r * 1.9} />}
            </g>
          );
        })}
      </svg>
      {showLabels && labels.length < members.length && (
        <p className="zoom-hint">{t.zoomForNames(members.length - labels.length)}</p>
      )}
      {board.sphere && (
        <div className="view-switch">
          <ViewSwitch />
        </div>
      )}
      <ZoomControls zoomBy={zoomBy} fit={fit} />
    </div>
  );
}
