// The phone's status bar under the board (roadmap 9.10): places, length and time of the game,
// and Zurück / Lösung zeigen, so a player sees them while tapping. It stays at the bottom of
// the screen; the full play panel follows below the board.

import { useState } from 'react';
import type { BoardModel } from '../board';
import { useFormat, useT } from '../i18n';
import { playNewGame, playReveal, playUndo } from '../play';
import { usePlayFigures } from '../playFigures';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { Timer } from './PlayParts';

export function PlayStatus({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const t = useT();
  const fmt = useFormat();
  const play = useStore((s) => s.play);
  const figures = usePlayFigures(board, puzzle);
  const [confirm, setConfirm] = useState(false);
  if (!figures || !puzzle) return null;
  const { n, visited, lengthUm, digital, excessUm, optimumUm } = figures;
  const length = digital
    ? `${fmt.number(lengthUm / 1000 / board.projection.mmPerKm, 0)} km`
    : `${fmt.number(lengthUm / 1000, 1)} mm`;
  const done = play.revealed || play.solvedMs !== null;
  const result =
    excessUm === null
      ? null
      : excessUm === 0
        ? `✓ ${t.scoreOptimal}`
        : digital && optimumUm
          ? `+${fmt.number((100 * excessUm) / optimumUm, 2)} %`
          : `+${fmt.number(excessUm / 1000, 1)} mm`;
  return (
    <div className="play-status" role="status">
      <span className="figures">
        <span className="figure">
          {fmt.integer(visited)}/{fmt.integer(n)}
        </span>
        <span className="figure">{length}</span>
        <span className="figure">
          <Timer startedAt={play.startedAt} stoppedMs={play.solvedMs ?? play.revealedMs} />
        </span>
        {result && (
          <span className={excessUm === 0 ? 'figure result optimal' : 'figure result'}>
            {result}
          </span>
        )}
      </span>
      <span className="actions">
        <button
          type="button"
          onClick={() => playUndo(puzzle)}
          disabled={visited === 0 || play.revealed}
        >
          {t.playUndo}
        </button>
        {done ? (
          <button type="button" onClick={playNewGame}>
            {t.playNewGame}
          </button>
        ) : confirm ? (
          <button
            type="button"
            className="primary"
            disabled={optimumUm === null}
            onClick={() => {
              setConfirm(false);
              playReveal(puzzle);
            }}
          >
            {t.playRevealConfirm}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} disabled={optimumUm === null}>
            {t.playReveal}
          </button>
        )}
      </span>
    </div>
  );
}
