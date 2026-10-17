// "So rechnet der Computer" (roadmap 9.18): opened by a button after a finished game, in the
// play panel. A bar chart of how much longer the visitor's round trip and the simple strategies
// are than the optimum (a row shows its tour on the map), and the animation of how the computer
// finds and proves the optimum. "Zurück" closes it; in the kiosk it never leads elsewhere.

import { useEffect, useMemo } from 'react';
import type { Strategy } from '../../core/computer';
import { stringLength } from '../../core/tsp/tour';
import type { BoardModel } from '../board';
import {
  animationSteps,
  closeComputer,
  computerModel,
  setAnimationStep,
  showComputerTour,
  startAnimation,
  useRounds,
  type ComputerTour,
} from '../computer';
import { useFormat, useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

interface Row {
  readonly tour: ComputerTour;
  readonly label: string;
  readonly hint: string;
  readonly lengthUm: number;
}

export function ComputerView({
  board,
  puzzle,
  path,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  /** An open path with a given leg (roadmap 9.15): its texts speak of a path. */
  readonly path: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const computer = useStore((s) => s.computer);
  const best = useStore((s) => s.play.best);
  const digital = useStore((s) => s.doc.purpose === 'digital');
  const model = computerModel(board, puzzle);
  const rounds = useRounds((s) => s.byKey[model.key]);
  const steps = useMemo(() => animationSteps(model, rounds), [model, rounds]);
  const v = puzzle.verification;
  const optimum = v?.status === 'done' ? v.verification.string : null;

  // The animation steps on by itself; the last step stays.
  const step = computer?.view === 'animation' ? computer.step : -1;
  useEffect(() => {
    if (!steps || step < 0 || step >= steps.length - 1) return;
    const timer = window.setTimeout(() => setAnimationStep(step + 1), steps[step]!.ms);
    return () => window.clearTimeout(timer);
  }, [steps, step]);

  if (!computer || !optimum) return null;
  const optimumUm = stringLength(model.inst, optimum.optimal);
  const strategy = (s: Strategy) =>
    s === 'nearest-neighbor'
      ? model.tours.nearestNeighbor
      : s === 'insertion'
        ? model.tours.insertion
        : model.tours.twoOpt;
  const rows: Row[] = [
    ...(best
      ? [
          {
            tour: 'player' as const,
            label: t.computerPlayer(path),
            hint: '',
            lengthUm: stringLength(model.inst, best.path),
          },
        ]
      : []),
    {
      tour: 'nearest-neighbor',
      label: t.computerNearest,
      hint: t.computerNearestHint,
      lengthUm: stringLength(model.inst, strategy('nearest-neighbor')),
    },
    {
      tour: 'insertion',
      label: t.computerInsertion,
      hint: t.computerInsertionHint,
      lengthUm: stringLength(model.inst, strategy('insertion')),
    },
    {
      tour: 'two-opt',
      label: t.computerTwoOpt,
      hint: t.computerTwoOptHint,
      lengthUm: stringLength(model.inst, strategy('two-opt')),
    },
    {
      tour: 'optimum',
      label: t.computerOptimum(path),
      hint: t.computerOptimumHint,
      lengthUm: optimumUm,
    },
  ];
  const excess = (um: number) => Math.max(0, um / optimumUm - 1);
  const most = Math.max(...rows.map((r) => excess(r.lengthUm)), 1e-9);
  const length = (um: number) =>
    digital
      ? `${fmt.number(um / 1000 / board.projection.mmPerKm, 0)} km`
      : `${fmt.number(um / 1000, 1)} mm`;

  if (computer.view === 'animation') {
    const current = steps?.[Math.min(step, steps.length - 1)];
    const caption = !current
      ? t.computerWait
      : current.phase === 'quick'
        ? t.computerQuick
        : current.phase === 'improve'
          ? t.computerImprove
          : current.phase === 'round'
            ? t.computerRound(fmt.integer(current.round ?? 1), fmt.integer(current.pieces ?? 2))
            : t.computerProven(path);
    const done = steps !== null && step >= steps.length - 1;
    return (
      <section className="computer-view">
        <h2>{t.computerHow(path)}</h2>
        <p className={done ? 'computer-caption proven' : 'computer-caption'} aria-live="polite">
          {caption}
        </p>
        {steps && !done && (
          <>
            <progress max={steps.length - 1} value={step} />
            <p className="hint">{t.computerTapToSkip}</p>
          </>
        )}
        <div className="actions">
          {steps && !done && (
            <button type="button" onClick={() => setAnimationStep(steps.length - 1)}>
              {t.computerSkip}
            </button>
          )}
          <button type="button" onClick={() => showComputerTour(null)}>
            {t.computerBack}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="computer-view">
      <h2>{t.computerOpen}</h2>
      <p className="hint">{t.computerIntro(path)}</p>
      <ul className="computer-bars">
        {rows.map((r) => {
          const e = excess(r.lengthUm);
          const shortest = r.lengthUm <= optimumUm + 0.5;
          const shown = computer.shown === r.tour;
          return (
            <li key={r.tour}>
              <button
                type="button"
                className={`computer-row ${r.tour}${shown ? ' shown' : ''}`}
                aria-pressed={shown}
                onClick={() => showComputerTour(shown ? null : r.tour)}
              >
                <span className="computer-label">
                  <strong>{r.label}</strong>
                  {r.hint && <span className="hint"> – {r.hint}</span>}
                </span>
                <span className="computer-bar">
                  <span style={{ width: `${shortest ? 2 : 4 + (96 * e) / most}%` }} />
                </span>
                <span className="computer-value">
                  {length(r.lengthUm)} ·{' '}
                  {shortest ? t.computerShortest : `+${fmt.number(100 * e, 1)} %`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hint">{t.computerTapRow}</p>
      <div className="actions">
        {rounds !== 'error' && (
          <button type="button" className="primary" disabled={!steps} onClick={startAnimation}>
            {steps ? t.computerHow(path) : t.computerWait}
          </button>
        )}
        <button type="button" onClick={closeComputer}>
          {t.computerBack}
        </button>
      </div>
    </section>
  );
}
