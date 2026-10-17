// Parts shared by the play panels: timer, highscores with the name field, sharing consent, the
// event mode's name and day's leaderboard.

import { useEffect, useRef, useState } from 'react';
import type { ScoreEntry } from '../../core/scores';
import { useT } from '../i18n';
import { LONG_PRESS_MS } from '../kiosk';
import {
  PLAY_DATA_URL,
  nextKioskPlayer,
  readConsent,
  readNicknameConsent,
  removeScore,
  scoresFor,
  todaysScores,
  writeConsent,
  writeNicknameConsent,
} from '../play';
import { formatDuration, useExcessText } from '../format';
import { useStore, writePlayerName } from '../store';

export function Timer({
  startedAt,
  stoppedMs,
}: {
  readonly startedAt: number | null;
  readonly stoppedMs: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null || stoppedMs !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, stoppedMs]);
  return <>{formatDuration(stoppedMs ?? (startedAt === null ? 0 : now - startedAt))}</>;
}

/**
 * The player's name in the event mode (roadmap 9.12): from a list, with a button for another
 * one; free text only with #kiosk?names=free.
 */
export function KioskPlayerName() {
  const t = useT();
  const name = useStore((s) => s.playerName);
  const free = useStore((s) => s.kioskFreeNames);
  useEffect(() => {
    if (!free && !name) nextKioskPlayer();
  }, [free, name]);
  if (free) return <PlayerName />;
  return (
    <div className="kiosk-name">
      <span>{t.playerName}:</span> <strong>{name}</strong>
      <button type="button" onClick={nextKioskPlayer}>
        {t.kioskOtherName}
      </button>
    </div>
  );
}

/** The player's nickname for the scores. */
export function PlayerName() {
  const t = useT();
  const name = useStore((s) => s.playerName);
  return (
    <label className="field">
      <span>{t.playerName}</span>
      <input
        type="text"
        value={name}
        maxLength={30}
        onChange={(e) => writePlayerName(e.target.value)}
      />
    </label>
  );
}

export function Highscores() {
  const t = useT();
  const playId = useStore((s) => s.playId);
  useStore((s) => s.scoresVersion);
  const excess = useExcessText();
  const scores = scoresFor(playId);
  return (
    <section>
      <h2>{t.highscores}</h2>
      <PlayerName />
      {scores.length === 0 ? (
        <p className="hint">{t.highscoresEmpty}</p>
      ) : (
        <table className="scores">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>{t.scoreName}</th>
              <th className="num">{t.scoreExcess}</th>
              <th className="num">{t.scoreTime}</th>
              <th>{t.scoreNote}</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, 10).map((s, i) => (
              <tr key={i} className={s.revealed ? 'revealed' : undefined}>
                <td className="num">{i + 1}</td>
                <td>{s.name || '–'}</td>
                <td className="num">{excess(s)}</td>
                <td className="num">{formatDuration(s.ms)}</td>
                <td>{s.revealed ? t.highscoreRevealed : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">{t.highscoresHint}</p>
    </section>
  );
}

export function ShareConsent() {
  const t = useT();
  const [consent, setConsent] = useState(readConsent);
  const [nickname, setNickname] = useState(readNicknameConsent);
  if (!PLAY_DATA_URL) return null;
  return (
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
      {consent && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={nickname}
            onChange={(e) => {
              setNickname(e.target.checked);
              writeNicknameConsent(e.target.checked);
            }}
          />
          {t.playShareNickname}
        </label>
      )}
      <p className="hint">{t.playShareHint}</p>
    </section>
  );
}

/** Today's best results of one puzzle, large. */
export function DailyScores({
  id,
  title,
  limit = 10,
}: {
  readonly id: string;
  readonly title?: string;
  readonly limit?: number;
}) {
  const t = useT();
  const excess = useExcessText();
  useStore((s) => s.scoresVersion);
  const scores = todaysScores(id).slice(0, limit);
  // Staff remove an entry (roadmap 9.12): a long press, or Shift+Delete on a focused entry,
  // then a confirmation. No PIN: the confirmation keeps it from happening by accident.
  const [removing, setRemoving] = useState<ScoreEntry | null>(null);
  const press = useRef<number | null>(null);
  const release = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };
  return (
    <section className="daily-scores">
      <h2>{title ?? t.kioskDaily}</h2>
      {scores.length === 0 ? (
        <p className="hint">{t.kioskDailyEmpty}</p>
      ) : (
        <ol>
          {scores.map((s, i) => (
            <li
              key={i}
              className={s.revealed ? 'revealed' : undefined}
              tabIndex={0}
              onPointerDown={() => {
                release();
                press.current = window.setTimeout(() => setRemoving(s), LONG_PRESS_MS);
              }}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === 'Delete' && e.shiftKey) setRemoving(s);
              }}
            >
              <span className="name">{s.name || '–'}</span>
              <span className="num">{excess(s)}</span>
              <span className="num">{formatDuration(s.ms)}</span>
            </li>
          ))}
        </ol>
      )}
      {removing && (
        <div className="score-remove" role="alertdialog" aria-label={t.kioskRemove}>
          <p>{t.kioskRemoveAsk(removing.name)}</p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                removeScore(id, removing);
                setRemoving(null);
              }}
            >
              {t.kioskRemove}
            </button>
            <button type="button" onClick={() => setRemoving(null)}>
              {t.combineCancel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
