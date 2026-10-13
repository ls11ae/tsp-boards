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
  playClick,
  playNewGame,
  playReveal,
  playRestart,
  playUndo,
  startPlaying,
} from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { OverlayPicker } from './OverlayPicker';
import { Highscores, ShareConsent, Timer } from './PlayParts';

/**
 * Keyboard play: the next place from a list (unvisited places by name; the start once all
 * are visited, to close the round trip).
 */
function NextPlace({
  board,
  puzzle,
  digital,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  readonly digital: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const state = useStore((s) => s.play.state);
  const [choice, setChoice] = useState('');
  const n = puzzle.members.length;
  const name = (slot: number) => board.pool[puzzle.members[slot]!]!.name;
  const visited = new Set(state.path);
  const options = puzzle.members
    .map((_, s) => s)
    .filter((s) => !visited.has(s))
    .sort((a, b) => name(a).localeCompare(name(b), fmt.lang));
  const start = state.path[0];
  const canClose = !state.closed && state.path.length === n && start !== undefined;
  if (state.closed) return null;
  const add = (value: string) => {
    const slot = Number(value);
    if (value === '' || !Number.isInteger(slot)) return;
    playClick(puzzle, slot);
    setChoice('');
  };
  return (
    <form
      className="next-place"
      onSubmit={(e) => {
        e.preventDefault();
        add(choice);
      }}
    >
      <label className="field">
        <span>{digital ? t.nextPlace : t.nextNail}</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">–</option>
          {canClose && <option value={start}>{t.closeTrip(name(start))}</option>}
          {options.map((s) => (
            <option key={s} value={s}>
              {name(s)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={choice === ''}>
        {t.addPlace}
      </button>
    </form>
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
        <p className="hint">{digital ? t.playHintDigital : t.playHint}</p>
        <dl className="metrics">
          <dt>{digital ? t.playVisitedPlaces : t.playVisited}</dt>
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
        {play.revealed && (
          <p className="legend">
            <span className="legend-line solution" /> {t.legendOptimum}{' '}
            {path.length > 1 && (
              <>
                <span className="legend-line dashed" /> {t.legendOwn}
              </>
            )}
          </p>
        )}
        {!play.revealed && play.solvedMs === null && (
          <NextPlace puzzle={puzzle} board={board} digital={digital} />
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
        {(play.revealed || play.solvedMs !== null) && (
          <OverlayPicker board={board} puzzle={puzzle} />
        )}
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
