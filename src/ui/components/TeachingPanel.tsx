// Teaching mode: choose a strategy and watch it build a round trip on the board.

import { useEffect, useState } from 'react';
import { TEACHING_KINDS, type TeachingKind, type TeachingNote } from '../../core/teaching';
import type { BoardModel } from '../board';
import { useFormat, useT } from '../i18n';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import {
  advanceTeaching,
  setTeachingPlaying,
  startTeaching,
  stepTeaching,
  stopTeaching,
} from '../teaching';

const FRAME_MS = 900;

export function TeachingPanel({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const fmt = useFormat();
  const teaching = useStore((s) => s.teaching);
  const digital = useStore((s) => s.doc.purpose === 'digital');
  const active = teaching?.key === puzzle.key ? teaching : null;
  // Default start: the largest place.
  const largest = puzzle.members.reduce(
    (best, c, s) => (board.pool[c]!.pop > board.pool[puzzle.members[best]!]!.pop ? s : best),
    0,
  );
  const [kind, setKind] = useState<TeachingKind>('nearest-neighbor');
  const [start, setStart] = useState<number | null>(null);
  const startSlot = start !== null && start < puzzle.members.length ? start : largest;

  useEffect(() => {
    if (!active?.playing || !active.frames) return;
    const timer = setTimeout(advanceTeaching, FRAME_MS);
    return () => clearTimeout(timer);
  }, [active?.playing, active?.frames, active?.index]);

  const name = (slot: number) => board.pool[puzzle.members[slot]!]!.name;
  const length = (um: number) =>
    digital
      ? `${fmt.number(um / 1000 / board.projection.mmPerKm, 0)} km`
      : `${fmt.number(um / 1000, 1)} mm`;
  const note = (n: TeachingNote): string => {
    switch (n.kind) {
      case 'nn-start':
        return t.teachNnStart(name(n.a));
      case 'nn-step':
        return t.teachNnStep(name(n.a), name(n.b));
      case 'nn-close':
        return t.teachNnClose(name(n.a), name(n.b));
      case 'hull':
        return t.teachHull(fmt.integer(n.count));
      case 'pair':
        return t.teachPair(name(n.a), name(n.b));
      case 'insert':
        return t.teachInsert(name(n.v), name(n.a), name(n.b));
      case 'greedy':
        return t.teachGreedy(name(n.a), name(n.b));
      case 'greedy-close':
        return t.teachGreedyClose(name(n.a), name(n.b));
      case 'two-opt-start':
        return t.teachTwoOptStart;
      case 'two-opt-remove':
        return t.teachTwoOptRemove(length(n.gainUm));
      case 'two-opt-add':
        return t.teachTwoOptAdd(length(n.gainUm));
      case 'two-opt-done':
        return t.teachTwoOptDone;
      case 'round':
        return t.teachRound(fmt.integer(n.round), fmt.integer(n.subtours));
      case 'optimal':
        return t.teachOptimal(fmt.integer(n.rounds));
    }
  };
  const labels: Record<TeachingKind, string> = {
    'nearest-neighbor': t.nearestNeighbor,
    insertion: board.sphere ? t.pairInsertion : t.hullInsertion,
    'greedy-edge': t.greedyEdge,
    'two-opt': t.teachTwoOpt,
    subtours: t.teachSubtours,
  };
  const frames = active?.frames ?? null;
  const frame = frames?.[active!.index] ?? null;
  const needsStart = kind === 'nearest-neighbor' || kind === 'two-opt';
  const order = puzzle.members
    .map((_, s) => s)
    .sort((a, b) => name(a).localeCompare(name(b), fmt.lang));

  return (
    <section>
      <h2>{t.teaching}</h2>
      <p className="hint">
        {board.sphere ? t.teachingHintSphere : digital ? t.teachingHintDigital : t.teachingHint}
      </p>
      <label className="field">
        <span>{t.teachStrategy}</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as TeachingKind)}>
          {TEACHING_KINDS.map((k) => (
            <option key={k} value={k}>
              {labels[k]}
            </option>
          ))}
        </select>
      </label>
      {needsStart && (
        <label className="field">
          <span>{t.teachStart}</span>
          <select value={startSlot} onChange={(e) => setStart(Number(e.target.value))}>
            {order.map((s) => (
              <option key={s} value={s}>
                {name(s)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => startTeaching(board, puzzle, kind, startSlot)}
        >
          {t.teachShow}
        </button>
        {active && (
          <button type="button" onClick={stopTeaching}>
            {t.teachClose}
          </button>
        )}
      </div>
      {active?.error && <p className="error">{active.error}</p>}
      {active && !frames && !active.error && <p className="hint">{t.teachComputing}</p>}
      {frames && frame && (
        <>
          <div className="actions teach-controls">
            <button type="button" onClick={() => stepTeaching(-Infinity)} aria-label={t.teachFirst}>
              ⏮
            </button>
            <button type="button" onClick={() => stepTeaching(-1)} aria-label={t.teachBack}>
              ◀
            </button>
            <button
              type="button"
              onClick={() => setTeachingPlaying(!active!.playing)}
              aria-label={active!.playing ? t.teachPause : t.teachPlay}
            >
              {active!.playing ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={() => stepTeaching(1)} aria-label={t.teachNext}>
              ⏭
            </button>
          </div>
          <p className="hint">
            {t.teachStep(fmt.integer(active!.index + 1), fmt.integer(frames.length))} ·{' '}
            {labels[active!.kind]}
          </p>
          <p className="teach-note">{note(frame.note)}</p>
          <p className="hint">{t.teachLength(length(frame.lengthUm))}</p>
        </>
      )}
    </section>
  );
}
