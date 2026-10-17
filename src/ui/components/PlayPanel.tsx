import { useEffect, useMemo, useState } from 'react';
import { effectiveREffMm } from '../../core/params';
import { pathLength } from '../../core/play';
import { placeName } from '../../core/data';
import { stringLength } from '../../core/tsp/tour';
import { boardInstance, pathEdge, shownRoute, type BoardModel } from '../board';
import { PlaceLegend } from './PlaceLegend';
import { useFormat, useT } from '../i18n';
import {
  judgePending,
  mapPlaces,
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
import { ComputerView } from './ComputerView';
import { openComputer, prepareRounds } from '../computer';
import { TOUCH, useMedia } from '../media';

import { DailyScores, Highscores, KioskPlayerName, ShareConsent, Timer } from './PlayParts';

/**
 * Keyboard play: the next place from a list (unvisited places by name; the start once all
 * are visited, to close the round trip). With given end points (roadmap 9.15) the end comes
 * last and closes the round trip.
 */
function NextPlace({
  board,
  puzzle,
  digital,
  ends,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
  readonly digital: boolean;
  readonly ends: readonly [number, number] | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const state = useStore((s) => s.play.state);
  const [choice, setChoice] = useState('');
  const n = puzzle.members.length;
  const name = (slot: number) => placeName(board.pool[puzzle.members[slot]!]!, fmt.lang);
  const visited = new Set(ends ? [ends[0], ends[1], ...state.path] : state.path);
  const options = puzzle.members
    .map((_, s) => s)
    .filter((s) => !visited.has(s))
    .sort((a, b) => name(a).localeCompare(name(b), fmt.lang));
  const start = ends ? ends[1] : state.path[0];
  const canClose = !state.closed && state.path.length === (ends ? n - 1 : n) && start !== undefined;
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
          {canClose && (
            <option value={start}>
              {ends ? t.playPathFinish(name(start)) : t.closeTrip(name(start))}
            </option>
          )}
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
  kiosk = false,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
  /** Event mode: name and the day's leaderboard; no links to the gallery or designer. */
  readonly kiosk?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const play = useStore((s) => s.play);
  const playId = useStore((s) => s.playId);
  const table = useStore((s) => s.kioskTable);
  const params = useStore((s) => s.params);
  const purpose = useStore((s) => s.doc.purpose);
  const list = useStore((s) => s.list);
  const worldView = useStore((s) => s.worldView);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const touch = useMedia(TOUCH);
  const v = puzzle?.verification;
  const optimum = v?.status === 'done' ? v.verification.string : null;
  const pathKey = play.state.path.join(',');
  const id = puzzle ? mapPlayId(puzzle) : null;
  const placesHash = puzzle ? mapPlaces(puzzle) : null;

  // Resume this puzzle's game (switching puzzles keeps each game).
  // In the event mode every visitor starts afresh (the last one's result is recorded).
  useEffect(() => {
    if (!id || placesHash === null || id === playId) return;
    startPlaying(id, placesHash);
    if (kiosk) playNewGame();
  }, [id, placesHash, playId, kiosk]);

  useEffect(() => {
    if (puzzle && id === playId) judgePending(puzzle);
    // Re-judge when the optimum arrives or the trip changes.
  }, [puzzle, optimum, pathKey, play.state.closed, id, playId]);

  const members = puzzle?.members;
  const rEff = effectiveREffMm(params, purpose);
  const docPath = useStore((s) => s.doc.path);
  const ends = useMemo(
    () => (members ? pathEdge(board, members, docPath) : null),
    [board, members, docPath],
  );
  const inst = useMemo(
    () => (members ? boardInstance(board, members, rEff, ends) : null),
    [board, members, rEff, ends],
  );
  // "So rechnet der Computer" (roadmap 9.18): the solver's rounds for its animation are computed
  // in the background once the optimum is known, so they are ready after the game.
  const computer = useStore((s) => s.computer);
  useEffect(() => {
    if (puzzle && optimum) prepareRounds(board, puzzle);
  }, [board, puzzle, optimum]);

  if (!puzzle || !inst) return <aside className="panel side">{t.loading}</aside>;
  const n = puzzle.members.length;
  const path = play.state.path;
  const length = play.state.closed ? stringLength(inst, path) : pathLength(inst, path);
  const mm = (um: number, d = 1) => fmt.number(um / 1000, d);
  const digital = purpose === 'digital';
  // A place list may hold alliances and points: "Orte", not "Städte".
  const places = list !== null;
  const km = (um: number, d = 1) => fmt.number(um / 1000 / board.projection.mmPerKm, d);
  const longer = (excessUm: number) =>
    digital && optimum
      ? (ends ? t.playPathLongerDigital : t.playLongerDigital)(
          fmt.number((100 * excessUm) / optimum.optimalLength, 2),
          km(excessUm),
        )
      : (ends ? t.playPathLonger : t.playLonger)(mm(excessUm));
  const name = (slot: number) => placeName(board.pool[puzzle.members[slot]!]!, fmt.lang);
  const last = play.attempts.at(-1);
  const judged = play.state.closed && play.judged === pathKey && last !== undefined;

  const finished = judged || play.revealed || play.solvedMs !== null;
  return (
    <aside className="panel side">
      {computer ? (
        <ComputerView board={board} puzzle={puzzle} path={ends !== null} />
      ) : (
        <section>
          <h2>
            {ends
              ? t.playPathTitle(fmt.integer(n), name(ends[0]), name(ends[1]))
              : t.playTitle(fmt.integer(n), places)}
          </h2>
          {kiosk && <KioskPlayerName />}
          {kiosk && !digital && <p className="hint kiosk-note">{t.kioskString}</p>}
          <p className="hint">
            {ends
              ? t.playPathHint(name(ends[0]), name(ends[1]), touch, digital)
              : digital
                ? touch
                  ? t.playHintDigitalTouch
                  : t.playHintDigital
                : touch
                  ? t.playHintTouch
                  : t.playHint}
          </p>
          <PlaceLegend board={board} members={puzzle.members} />
          {board.sphere && (
            <p className="hint">{worldView === 'globe' ? t.playHintGlobe : t.playHintWorld}</p>
          )}
          <dl className="metrics">
            <dt>{digital ? t.playVisitedPlaces : t.playVisited}</dt>
            <dd>
              {fmt.integer(path.length)} / {fmt.integer(n)}
            </dd>
            <dt>{ends ? t.playPathLength : digital ? t.tourLengthKm : t.stringLength}</dt>
            <dd>{digital ? `${km(length, 0)} km` : `${mm(length)} mm`}</dd>
            <dt>{t.playTime}</dt>
            <dd>
              <Timer startedAt={play.startedAt} stoppedMs={play.solvedMs ?? play.revealedMs} />
            </dd>
            <dt>{ends ? t.playPathAttempts : t.playAttempts}</dt>
            <dd>{fmt.integer(play.attempts.length)}</dd>
          </dl>
          {play.state.closed && !judged && (
            <p className="hint">{ends ? t.playPathComputing : t.playComputing}</p>
          )}
          {judged &&
            (last.excessUm === 0 ? (
              <p className="play-result optimal">{ends ? t.playPathOptimal : t.playOptimal}</p>
            ) : (
              <p className="play-result">{longer(last.excessUm)}</p>
            ))}
          {play.solvedMs !== null && !judged && (
            <p className="play-result optimal">{t.playSolvedBefore}</p>
          )}
          {finished && optimum && (
            <div className="actions">
              <button type="button" className="computer-open" onClick={() => openComputer(puzzle)}>
                {t.computerOpen}
              </button>
            </div>
          )}
          {play.revealed && optimum && (
            <p className="hint">
              {digital
                ? (ends ? t.playPathRevealedDigital : t.playRevealedDigital)(
                    km(optimum.optimalLength, 0),
                  )
                : (ends ? t.playPathRevealed : t.playRevealed)(mm(optimum.optimalLength))}
            </p>
          )}
          {play.revealed && (
            <p className="legend">
              <span className="legend-line solution" />{' '}
              {ends ? t.legendPathOptimum : t.legendOptimum}{' '}
              {path.length > 1 && (
                <>
                  <span className="legend-line dashed" /> {t.legendOwn}
                </>
              )}
            </p>
          )}
          {!play.revealed && play.solvedMs === null && (
            <NextPlace puzzle={puzzle} board={board} digital={digital} ends={ends} />
          )}
          <div className="actions">
            <button
              type="button"
              onClick={() => playUndo(puzzle)}
              disabled={path.length === 0 || play.revealed}
            >
              {t.playUndo}
            </button>
            <button type="button" onClick={playRestart} disabled={path.length === 0}>
              {t.playRestart}
            </button>
            {/* After an optimal round trip there is nothing left to show. */}
            {!play.revealed &&
              play.solvedMs === null &&
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
          {board.sphere && (
            <FlightButtons
              puzzle={puzzle}
              ends={ends && [puzzle.members[ends[0]]!, puzzle.members[ends[1]]!]}
            />
          )}
        </section>
      )}
      {kiosk && id ? (
        <DailyScores id={id} title={table ? t.kioskDailyTable(table) : undefined} />
      ) : (
        <>
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
        </>
      )}
    </aside>
  );
}

/**
 * Flights on the globe (roadmap 9.3): the solution, or the player's own closed round trip. An
 * open path (roadmap 9.15) is flown from its start, and its given leg closes the loop.
 */
function FlightButtons({
  puzzle,
  ends,
}: {
  readonly puzzle: PuzzleView;
  readonly ends: readonly [number, number] | null;
}) {
  const t = useT();
  const play = useStore((s) => s.play);
  const flying = useStore((s) => s.flight !== null);
  const fly = (cities: readonly number[]) =>
    useStore.setState({ worldView: 'globe', flight: { cities, key: Date.now() } });
  const done = play.revealed || play.solvedMs !== null;
  const own = play.state.closed ? play.state.path.map((s) => puzzle.members[s]!) : null;
  if (!done && !own) return null;
  return (
    <div className="actions">
      {flying ? (
        <button type="button" onClick={() => useStore.setState({ flight: null })}>
          {t.flyStop}
        </button>
      ) : (
        <>
          {done && puzzle.tour && (
            <button
              type="button"
              className="primary"
              onClick={() => fly(shownRoute(puzzle.tour!, ends).cities)}
            >
              {t.flyTour}
            </button>
          )}
          {own && (
            <button type="button" onClick={() => fly(own)}>
              {t.flyOwn}
            </button>
          )}
        </>
      )}
    </div>
  );
}
