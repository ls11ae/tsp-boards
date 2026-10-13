// Parts shared by the play panels: timer, highscores with the name field, sharing consent.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  PLAY_DATA_URL,
  readConsent,
  readNicknameConsent,
  scoresFor,
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

export function Highscores() {
  const t = useT();
  const playId = useStore((s) => s.playId);
  const name = useStore((s) => s.playerName);
  useStore((s) => s.scoresVersion);
  const excess = useExcessText();
  const scores = scoresFor(playId);
  return (
    <section>
      <h2>{t.highscores}</h2>
      <label className="field">
        <span>{t.playerName}</span>
        <input
          type="text"
          value={name}
          maxLength={30}
          onChange={(e) => writePlayerName(e.target.value)}
        />
      </label>
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
