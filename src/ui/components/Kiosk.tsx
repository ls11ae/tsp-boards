// Event mode for a booth (roadmap 9.4, 9.12), opened with #kiosk: full screen, a start screen
// with three levels, large touch targets, "Nächste Person", a reset after inactivity, no
// designer and no links out. Players get names from a list (free names only with
// #kiosk?names=free). #kiosk/scores shows the day's leaderboards large, e.g. on a second
// screen; staff remove an entry by a long press and a confirmation.

import { useEffect, useState } from 'react';
import { localText, type CollectionEntry } from '../../core/puzzle-file';
import { useBoard } from '../board';
import { loadCollection, loadCollectionPuzzle, openDocument } from '../documents';
import { useFormat, useT } from '../i18n';
import { nextKioskPlayer, playNewGame, recordUnfinishedScore, reloadScores } from '../play';
import { usePuzzle } from '../puzzle';
import { useStore, writePlayerName } from '../store';
import { EntryThumbnail } from './Gallery';
import { PlayBoard } from './PlayBoard';
import { PlayPanel } from './PlayPanel';
import { DailyScores } from './PlayParts';
import { PlayGlobe } from './WorldGlobe';
import { INACTIVITY_MS, KIOSK_LEVELS } from '../kiosk';

function useCollection(): readonly CollectionEntry[] {
  const [entries, setEntries] = useState<readonly CollectionEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void loadCollection().then((index) => {
      if (alive) setEntries(index.puzzles);
    });
    return () => {
      alive = false;
    };
  }, []);
  return entries;
}

function StartScreen({ entries }: { readonly entries: readonly CollectionEntry[] }) {
  const t = useT();
  const fmt = useFormat();
  const table = useStore((s) => s.kioskTable);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const open = (e: CollectionEntry) => {
    void loadCollectionPuzzle(e.file).then((doc) => {
      openDocument(doc, 'play');
      nextKioskPlayer();
      useStore.setState({ page: 'app', kiosk: 'play', flight: null });
    });
  };
  const titles = { easy: t.kioskEasy, medium: t.kioskMedium, hard: t.kioskHard };
  return (
    <main className="kiosk-start">
      {table && <p className="kiosk-table">{t.kioskTable(table)}</p>}
      <h1>{t.kioskTitle}</h1>
      <p className="kiosk-lead">{t.kioskLead}</p>
      <div className="kiosk-levels">
        {KIOSK_LEVELS.map((level) => (
          <section key={level.key} className={`kiosk-level ${level.key}`}>
            <h2>{titles[level.key]}</h2>
            {level.ids.flatMap((id) => {
              const e = byId.get(id);
              return e
                ? [
                    <button key={id} type="button" className="kiosk-card" onClick={() => open(e)}>
                      <EntryThumbnail entry={e} />
                      <strong>{localText(e.title, fmt.lang)}</strong>
                      <span>{t.placesCount(fmt.integer(e.n))}</span>
                    </button>,
                  ]
                : [];
            })}
          </section>
        ))}
      </div>
      <div className="actions kiosk-actions">
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
        >
          {t.kioskFullscreen}
        </button>
        <button type="button" onClick={() => useStore.setState({ kiosk: 'scores' })}>
          {t.kioskDaily}
        </button>
      </div>
    </main>
  );
}

function ScoresScreen({ entries }: { readonly entries: readonly CollectionEntry[] }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const table = useStore((s) => s.kioskTable);
  // Another tab (the booth's game) adds results: read them again regularly and on change.
  useEffect(() => {
    const onStorage = () => reloadScores();
    window.addEventListener('storage', onStorage);
    const timer = setInterval(reloadScores, 10_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(timer);
    };
  }, []);
  const ids = KIOSK_LEVELS.flatMap((l) => l.ids);
  const shown = ids.flatMap((id) => entries.filter((e) => e.id === id));
  return (
    <main className="kiosk-scores">
      <h1>{table ? t.kioskDailyTable(table) : t.kioskDaily}</h1>
      <div className="kiosk-score-grid">
        {shown.map((e) => (
          <DailyScores key={e.id} id={e.id} title={localText(e.title, lang)} limit={5} />
        ))}
      </div>
      <div className="actions kiosk-actions">
        <button type="button" onClick={() => useStore.setState({ kiosk: 'start' })}>
          {t.kioskBack}
        </button>
      </div>
    </main>
  );
}

function PlayScreen() {
  const t = useT();
  const board = useBoard();
  const puzzle = usePuzzle();
  const worldView = useStore((s) => s.worldView);
  const title = useStore((s) => localText(s.doc.title, s.lang));
  return (
    <div className="app play kiosk-play">
      <header className="header kiosk-header">
        <h1>{title}</h1>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              recordUnfinishedScore();
              playNewGame();
              nextKioskPlayer();
            }}
          >
            {t.kioskNext}
          </button>
          <button
            type="button"
            onClick={() => {
              recordUnfinishedScore();
              useStore.setState({ kiosk: 'start', flight: null });
            }}
          >
            {t.kioskBack}
          </button>
        </div>
      </header>
      <main className="stage">
        {board &&
          (board.sphere && worldView === 'globe' ? (
            <PlayGlobe board={board} puzzle={puzzle} />
          ) : (
            <PlayBoard board={board} puzzle={puzzle} />
          ))}
      </main>
      {board && <PlayPanel board={board} puzzle={puzzle} kiosk />}
    </div>
  );
}

export function KioskApp() {
  const screen = useStore((s) => s.kiosk);
  const country = useStore((s) => s.country);
  const lang = useStore((s) => s.lang);
  const entries = useCollection();

  // After a while without input, the booth starts over: start screen, no name.
  useEffect(() => {
    if (screen !== 'play') return;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = setInterval(() => {
      if (Date.now() - last < INACTIVITY_MS) return;
      recordUnfinishedScore();
      playNewGame();
      writePlayerName('');
      useStore.setState({ kiosk: 'start', flight: null });
    }, 5000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      clearInterval(timer);
    };
  }, [screen]);

  return (
    <div className="kiosk">
      {screen === 'play' ? (
        <PlayScreen />
      ) : screen === 'scores' ? (
        <ScoresScreen entries={entries} />
      ) : (
        <StartScreen entries={entries} />
      )}
      {country && <footer className="footer kiosk-footer">{country.attribution[lang]}</footer>}
    </div>
  );
}
