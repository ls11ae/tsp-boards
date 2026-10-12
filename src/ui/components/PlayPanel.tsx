import { useEffect, useMemo, useState } from 'react';
import { Instance } from '../../core/instance';
import { effectiveREffMm } from '../../core/params';
import { pathLength } from '../../core/play';
import { stringLength } from '../../core/tsp/tour';
import type { BoardModel } from '../board';
import { useFormat, useT } from '../i18n';
import {
  judgePending,
  mapPlayId,
  openInDesigner,
  playNewGame,
  playReveal,
  playRestart,
  playUndo,
  startPlaying,
} from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { Highscores, ShareConsent, Timer } from './PlayParts';

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
  const playId = useStore((s) => s.playId);
  const params = useStore((s) => s.params);
  const purpose = useStore((s) => s.doc.purpose);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const v = puzzle?.verification;
  const optimum = v?.status === 'done' ? v.verification.string : null;
  const pathKey = play.state.path.join(',');
  const id = puzzle ? mapPlayId(puzzle) : null;

  // Resume this puzzle's game (switching puzzles keeps each game).
  useEffect(() => {
    if (id && id !== playId) startPlaying(id);
  }, [id, playId]);

  useEffect(() => {
    if (puzzle && id === playId) judgePending(puzzle);
    // Re-judge when the optimum arrives or the trip changes.
  }, [puzzle, optimum, pathKey, play.state.closed, id, playId]);

  const members = puzzle?.members;
  const rEff = effectiveREffMm(params, purpose);
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
  const digital = purpose === 'digital';
  const km = (um: number, d = 1) => fmt.number(um / 1000 / board.projection.mmPerKm, d);
  const longer = (excessUm: number) =>
    digital && optimum
      ? t.playLongerDigital(fmt.number((100 * excessUm) / optimum.optimalLength, 2), km(excessUm))
      : t.playLonger(mm(excessUm));
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
          <dt>{digital ? t.tourLengthKm : t.stringLength}</dt>
          <dd>{digital ? `${km(length, 0)} km` : `${mm(length)} mm`}</dd>
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
            <p className="play-result">{longer(last.excessUm)}</p>
          ))}
        {play.solvedMs !== null && !judged && (
          <p className="play-result optimal">{t.playSolvedBefore}</p>
        )}
        {play.revealed && optimum && (
          <p className="hint">
            {digital
              ? t.playRevealedDigital(km(optimum.optimalLength, 0))
              : t.playRevealed(mm(optimum.optimalLength))}
          </p>
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
          {(play.revealed || play.solvedMs !== null) && (
            <button type="button" onClick={playNewGame}>
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
        <button type="button" onClick={openInDesigner}>
          {t.playDesigner}
        </button>
      </section>
    </aside>
  );
}
