// Play mode of the incremental puzzle: the board with numbered nails (the nails of the current
// instance active), the player's round trip, and the panel with progress and highscores. The
// board is drawn like the map's play board (roadmap 9.6): nails and numbers at screen size,
// zoom and pan, a finger-sized click radius; the measuring track is left to the wooden board.

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Point } from '../../core/geometry';
import { pathLength } from '../../core/play';
import { Instance } from '../../core/instance';
import { stringLength } from '../../core/tsp/tour';
import { useFormat, useT } from '../i18n';
import {
  currentStage,
  incrementalClick,
  incrementalNewGame,
  incrementalPlayId,
  incrementalReveal,
  incrementalRestartStage,
  incrementalSkip,
  incrementalUndo,
  stageRevealed,
  startIncrementalPlay,
} from '../incremental-play';
import { useStore } from '../store';
import { labelSizeMm, MARKER_PX, screenLabels, useZoomView } from '../zoom';
import { Highscores, ShareConsent, Timer } from './PlayParts';
import { ZoomControls } from './ZoomControls';

const NO_POINTS: readonly Point[] = [];

export function IncrementalPlayBoard() {
  const t = useT();
  const inc = useStore((s) => s.inc);
  const play = useStore((s) => s.play);
  const playId = useStore((s) => s.playId);
  const id = inc.puzzle ? incrementalPlayId() : null;
  useEffect(() => {
    if (id && id !== playId) startIncrementalPlay();
  }, [id, playId]);
  const { puzzle } = inc;
  const points = puzzle?.points ?? NO_POINTS;
  const W = puzzle?.params.widthMm ?? 300;
  const H = puzzle?.params.heightMm ?? 300;
  const k = currentStage(play);

  // The view starts with the whole board and a margin (the zoom buttons sit over it); it
  // resets with the puzzle.
  const fitted = useMemo(() => {
    const pad = 0.06 * Math.max(W, H);
    return { x: -pad, y: -pad, w: W + 2 * pad, h: H + 2 * pad };
  }, [W, H, puzzle]); // eslint-disable-line react-hooks/exhaustive-deps
  const { wrapRef, svgRef, view, viewArea, mm, zoomBy, fit, handlers } = useZoomView(
    fitted,
    Math.max(W, H) * 1.5,
    ([px, py], hitMm) => {
      let best = -1;
      let nearest = hitMm;
      points.forEach(([x, y], i) => {
        const d = Math.hypot(x - px, y - py);
        if (i < k && d < nearest) {
          nearest = d;
          best = i;
        }
      });
      if (best >= 0) incrementalClick(best);
    },
  );

  // The nails' numbers at screen size (all of them, as engraved on the board).
  const labelMm = labelSizeMm(mm);
  const labels = useMemo(
    () =>
      screenLabels(
        points,
        points.map((_, i) => String(i + 1)),
        labelMm,
        viewArea,
      ),
    [points, labelMm, viewArea],
  );

  if (!puzzle) return <p className="hint">{inc.status === 'running' ? t.generating : t.loading}</p>;
  const coords = (i: number) => puzzle.points[i]!.map((c) => c.toFixed(2)).join(',');
  const path = play.state.path.map(coords);
  const step = puzzle.steps.find((s) => s.k === k);
  const solution = stageRevealed(play) && step ? step.tour.map(coords).join(' ') : null;
  const visited = new Set(play.state.path);
  const r = mm(MARKER_PX);
  const hidden = labels.filter((d) => d === null).length;
  const placeClass = (i: number) =>
    play.state.path[0] === i
      ? 'play-place start'
      : visited.has(i)
        ? 'play-place visited'
        : 'play-place';

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
        aria-label={t.incrementalPuzzle}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
      >
        <rect className="board-bg" width={W} height={H} />
        {solution && <polygon className="solution-tour" points={solution} />}
        {path.length > 1 &&
          (play.state.closed ? (
            <polygon className="play-path" points={path.join(' ')} />
          ) : (
            <polyline className="play-path" points={path.join(' ')} />
          ))}
        <g className="play-labels">
          {labels.map((d, i) =>
            d === null ? null : (
              <path key={i} className={i < k ? 'play-label' : 'play-label inactive'} d={d.d} />
            ),
          )}
        </g>
        {puzzle.points.map(([x, y], i) =>
          i < k ? (
            <g key={i} className={placeClass(i)}>
              <circle cx={x} cy={y} r={r} />
            </g>
          ) : (
            <circle key={i} className="inc-nail inactive" cx={x} cy={y} r={r * 0.55} />
          ),
        )}
      </svg>
      {hidden > 0 && <p className="zoom-hint">{t.zoomForNumbers(hidden)}</p>}
      <ZoomControls zoomBy={zoomBy} fit={fit} />
    </div>
  );
}

export function IncrementalPlayPanel() {
  const t = useT();
  const fmt = useFormat();
  const inc = useStore((s) => s.inc);
  const play = useStore((s) => s.play);
  const [confirm, setConfirm] = useState(false);
  const puzzle = inc.puzzle;
  if (!puzzle) return <aside className="panel side">{t.loading}</aside>;
  const n = puzzle.points.length;
  const k = currentStage(play);
  const inst = new Instance(puzzle.points.slice(0, k), puzzle.params.rEffMm);
  const path = play.state.path;
  const length = play.state.closed ? stringLength(inst, path) : pathLength(inst, path);
  const last = play.attempts.at(-1);
  const judgedHere = play.judged === `${k}:${path.join(',')}` && last !== undefined;
  const done = play.solvedMs !== null;
  return (
    <aside className="panel side">
      <section>
        <h2>{t.incPlayTitle(fmt.integer(n))}</h2>
        <p className="hint">{t.incPlayHint}</p>
        <progress value={done ? n - 2 : k - 3} max={n - 2} />
        <dl className="metrics">
          <dt>{t.incPlayStage}</dt>
          <dd>{done ? t.incPlayDone : t.incPlayNails(fmt.integer(k))}</dd>
          <dt>{t.playVisited}</dt>
          <dd>
            {fmt.integer(path.length)} / {fmt.integer(k)}
          </dd>
          <dt>{t.stringLength}</dt>
          <dd>{fmt.number(length / 1000, 1)} mm</dd>
          <dt>{t.playTime}</dt>
          <dd>
            <Timer startedAt={play.startedAt} stoppedMs={play.solvedMs} />
          </dd>
          <dt>{t.playAttempts}</dt>
          <dd>{fmt.integer(play.attempts.length)}</dd>
        </dl>
        {done && <p className="play-result optimal">{t.incPlayAllDone}</p>}
        {!done && judgedHere && last.excessUm > 0 && (
          <p className="play-result">{t.playLonger(fmt.number(last.excessUm / 1000, 1))}</p>
        )}
        {!done && k > 3 && path.length === 0 && (
          <p className="play-result optimal">{t.incPlayNext(fmt.integer(k - 1), fmt.integer(k))}</p>
        )}
        <div className="actions">
          <button type="button" onClick={incrementalUndo} disabled={path.length === 0 || done}>
            {t.playUndo}
          </button>
          <button type="button" onClick={incrementalRestartStage} disabled={path.length === 0}>
            {t.playRestart}
          </button>
          {!done &&
            (stageRevealed(play) ? (
              <button type="button" className="primary" onClick={incrementalSkip}>
                {t.incPlaySkip}
              </button>
            ) : confirm ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setConfirm(false);
                  incrementalReveal();
                }}
              >
                {t.playRevealConfirm}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm(true)}>
                {t.playReveal}
              </button>
            ))}
          {done && (
            <button type="button" onClick={incrementalNewGame}>
              {t.playNewGame}
            </button>
          )}
        </div>
      </section>
      <Highscores />
      <ShareConsent />
      <section className="actions">
        <button type="button" onClick={() => useStore.setState({ page: 'gallery' })}>
          {t.backToGallery}
        </button>
        <button type="button" onClick={() => useStore.setState({ mode: 'design', playId: null })}>
          {t.playDesigner}
        </button>
      </section>
    </aside>
  );
}
