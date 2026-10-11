import { useEffect, useMemo, useState } from 'react';
import { pathLength } from '../../core/play';
import { stringLength } from '../../core/tsp/tour';
import { Instance } from '../../core/instance';
import { rEffMm } from '../../core/params';
import type { BoardModel } from '../board';
import { useFormat, useT } from '../i18n';
import {
  PLAY_DATA_URL,
  judgePending,
  openInDesigner,
  playReveal,
  playRestart,
  playUndo,
  readConsent,
  writeConsent,
} from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';

function Timer({ startedAt, stoppedMs }: { startedAt: number | null; stoppedMs: number | null }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt === null || stoppedMs !== null) return;
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, stoppedMs]);
  const ms = stoppedMs ?? (startedAt === null ? 0 : now - startedAt);
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    <>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </>
  );
}

export function PlayPanel({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const play = useStore((s) => s.play);
  const params = useStore((s) => s.params);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [consent, setConsent] = useState(readConsent);
  const v = puzzle?.verification;
  const optimum = v?.status === 'done' ? v.verification.string : null;
  const pathKey = play.state.path.join(',');

  useEffect(() => {
    if (puzzle) judgePending(puzzle);
    // Re-judge when the optimum arrives or the trip changes.
  }, [puzzle, optimum, pathKey, play.state.closed]);

  const members = puzzle?.members;
  const rEff = rEffMm(params);
  const inst = useMemo(
    () =>
      members
        ? new Instance(
            members.map((c) => board.points[c]!),
            rEff,
          )
        : null,
    [board, members, rEff],
  );

  if (!puzzle || !inst) return <aside className="panel side">{t.loading}</aside>;
  const n = puzzle.members.length;
  const path = play.state.path;
  const length = play.state.closed ? stringLength(inst, path) : pathLength(inst, path);
  const mm = (um: number, d = 1) => fmt.number(um / 1000, d);
  const last = play.attempts.at(-1);
  const judged = play.state.closed && play.judged === pathKey && last !== undefined;

  return (
    <aside className="panel side">
      <section>
        <h2>{t.playTitle(fmt.integer(n))}</h2>
        <p className="hint">{t.playHint}</p>
        <dl className="metrics">
          <dt>{t.playVisited}</dt>
          <dd>
            {fmt.integer(path.length)} / {fmt.integer(n)}
          </dd>
          <dt>{t.stringLength}</dt>
          <dd>{mm(length)} mm</dd>
          <dt>{t.playTime}</dt>
          <dd>
            <Timer startedAt={play.startedAt} stoppedMs={play.solvedMs} />
          </dd>
          <dt>{t.playAttempts}</dt>
          <dd>{fmt.integer(play.attempts.length)}</dd>
        </dl>
        {play.state.closed && !judged && <p className="hint">{t.playComputing}</p>}
        {judged &&
          (last.excessUm === 0 ? (
            <p className="play-result optimal">{t.playOptimal}</p>
          ) : (
            <p className="play-result">{t.playLonger(mm(last.excessUm))}</p>
          ))}
        {play.revealed && optimum && (
          <p className="hint">{t.playRevealed(mm(optimum.optimalLength))}</p>
        )}
        <div className="actions">
          <button type="button" onClick={playUndo} disabled={path.length === 0 || play.revealed}>
            {t.playUndo}
          </button>
          <button type="button" onClick={playRestart} disabled={path.length === 0}>
            {t.playRestart}
          </button>
          {!play.revealed &&
            (confirmReveal ? (
              <button
                type="button"
                className="primary"
                disabled={!optimum}
                onClick={() => {
                  setConfirmReveal(false);
                  playReveal(puzzle);
                }}
              >
                {t.playRevealConfirm}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmReveal(true)} disabled={!optimum}>
                {t.playReveal}
              </button>
            ))}
        </div>
      </section>
      {PLAY_DATA_URL && (
        <section>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                writeConsent(e.target.checked);
              }}
            />
            {t.playShare}
          </label>
          <p className="hint">{t.playShareHint}</p>
        </section>
      )}
      <section>
        <button type="button" onClick={openInDesigner}>
          {t.playDesigner}
        </button>
      </section>
    </aside>
  );
}
