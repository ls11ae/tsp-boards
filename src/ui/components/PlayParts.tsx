// Parts shared by the play panels: timer, highscores with the name field, sharing consent.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  PLAY_DATA_URL,
  readConsent,
  readNicknameConsent,
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
  return (
    <section className="daily-scores">
      <h2>{title ?? t.kioskDaily}</h2>
      {scores.length === 0 ? (
        <p className="hint">{t.kioskDailyEmpty}</p>
      ) : (
        <ol>
          {scores.map((s, i) => (
            <li key={i} className={s.revealed ? 'revealed' : undefined}>
              <span className="name">{s.name || '–'}</span>
              <span className="num">{excess(s)}</span>
              <span className="num">{formatDuration(s.ms)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
