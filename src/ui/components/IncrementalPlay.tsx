// Play mode of the incremental puzzle: the board with numbered nails (the nails of the current
// instance active), the player's round trip, and the panel with progress and highscores.

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { pathLength } from '../../core/play';
import { Instance } from '../../core/instance';
import { stringLength } from '../../core/tsp/tour';
import { useFormat, useT } from '../i18n';
import { incrementalPreview } from '../incremental';
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
import { boardFit } from './fit';
import { Highscores, ShareConsent, Timer } from './PlayParts';

const CLICK_RADIUS_MM = 12;

export function IncrementalPlayBoard() {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const inc = useStore((s) => s.inc);
  const play = useStore((s) => s.play);
  const playId = useStore((s) => s.playId);
  const id = inc.puzzle ? incrementalPlayId() : null;
  useEffect(() => {
    if (id && id !== playId) startIncrementalPlay();
  }, [id, playId]);
  const { puzzle, params } = inc;
  if (!puzzle) return <p className="hint">{inc.status === 'running' ? t.generating : t.loading}</p>;
  const k = currentStage(play);
  const preview = incrementalPreview(puzzle, params, 'mark');
  const { widthMm: w, heightMm: h } = puzzle.params;
  const path = play.state.path.map((i) => puzzle.points[i]!.map((c) => c.toFixed(2)).join(','));
  const step = puzzle.steps.find((s) => s.k === k);
  const solution =
    stageRevealed(play) && step
      ? step.tour.map((i) => puzzle.points[i]!.map((c) => c.toFixed(2)).join(',')).join(' ')
      : null;

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    let best = -1;
    let nearest = CLICK_RADIUS_MM;
    puzzle.points.forEach(([x, y], i) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (i < k && d < nearest) {
        nearest = d;
        best = i;
      }
    });
    if (best >= 0) incrementalClick(best);
  };

  return (
    <svg
      ref={svgRef}
      className="board"
      style={boardFit(w, h)}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={t.incrementalPuzzle}
      onClick={onClick}
    >
      <g className="preview">
        <rect className="board-bg" width={w} height={h} />
        <path className="lay-score" d={preview.score} />
        <path className="lay-engrave" d={preview.engrave} />
      </g>
      {solution && <polygon className="tour" points={solution} />}
      {path.length > 1 &&
        (play.state.closed ? (
          <polygon className="play-path" points={path.join(' ')} />
        ) : (
          <polyline className="play-path" points={path.join(' ')} />
        ))}
      {puzzle.points.map(([x, y], i) => (
        <circle
          key={i}
          className={
            i >= k
              ? 'inc-nail inactive'
              : play.state.path.includes(i)
                ? 'inc-nail visited'
                : 'inc-nail live'
          }
          cx={x}
          cy={y}
          r={i < k ? 4 : 2.5}
        />
      ))}
    </svg>
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
