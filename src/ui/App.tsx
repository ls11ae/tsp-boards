import { useEffect } from 'react';
import { useBoard } from './board';
import { BoardMap } from './components/BoardMap';
import { PlayBoard } from './components/PlayBoard';
import { Gallery } from './components/Gallery';
import { IncrementalPlayBoard, IncrementalPlayPanel } from './components/IncrementalPlay';
import { IncrementalBoard, IncrementalParams, IncrementalSide } from './components/IncrementalView';
import { ParamsPanel } from './components/ParamsPanel';
import { PlayPanel } from './components/PlayPanel';
import { SidePanel } from './components/SidePanel';
import { loadData } from './controller';
import { useT } from './i18n';
import { usePuzzle } from './puzzle';
import { useStore, type Language, type PuzzleType } from './store';

function Header() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const mode = useStore((s) => s.mode);
  const page = useStore((s) => s.page);
  const puzzleType = useStore((s) => s.puzzleType);
  const setPuzzleType = useStore((s) => s.setPuzzleType);
  // A digital puzzle in play has no nails or string.
  const digitalPlay = useStore(
    (s) => s.page === 'app' && s.mode === 'play' && s.doc.purpose === 'digital',
  );
  const types: [PuzzleType, string][] = [
    ['map', t.mapPuzzle],
    ['incremental', t.incrementalPuzzle],
  ];
  return (
    <header className="header">
      <div>
        <h1>{t.appTitle}</h1>
        <p className="tagline">{digitalPlay ? t.appTaglineDigital : t.appTagline}</p>
      </div>
      <div className="lang" role="group" aria-label={t.puzzleType}>
        <button
          type="button"
          className={page === 'gallery' ? 'selected' : undefined}
          aria-pressed={page === 'gallery'}
          onClick={() => useStore.setState({ page: 'gallery' })}
        >
          {t.gallery}
        </button>
        {types.map(([type, label]) => {
          const active = page === 'app' && mode === 'design' && type === puzzleType;
          return (
            <button
              key={type}
              type="button"
              className={active ? 'selected' : undefined}
              aria-pressed={active}
              onClick={() => {
                if (mode === 'play' || page === 'gallery' || type !== puzzleType)
                  setPuzzleType(type);
                useStore.setState({ page: 'app', mode: 'design' });
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="lang" role="group" aria-label={t.language}>
        {(['en', 'de'] as const satisfies readonly Language[]).map((l) => (
          <button
            key={l}
            type="button"
            className={l === lang ? 'selected' : undefined}
            aria-pressed={l === lang}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}

/** Title of the open puzzle above the board. */
function BoardTitle() {
  const doc = useStore((s) => s.doc);
  if (!doc.title) return null;
  return (
    <div className="board-title">
      <h2>{doc.title}</h2>
      {doc.description && <p className="hint">{doc.description}</p>}
    </div>
  );
}

function Footer() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const country = useStore((s) => s.country);
  return (
    <footer className="footer">
      {country && <p>{country.attribution[lang]}</p>}
      <p>
        {t.credits} {t.version(__APP_VERSION__, String(country?.dataVersion ?? '–'))}
      </p>
    </footer>
  );
}

export function App() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const loadError = useStore((s) => s.loadError);
  const board = useBoard();
  const puzzle = usePuzzle();
  const mode = useStore((s) => s.mode);
  const page = useStore((s) => s.page);
  const puzzleType = useStore((s) => s.puzzleType);

  useEffect(() => {
    void loadData();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // Every view starts at its top (on a phone, "Spielen" in the gallery otherwise lands below
  // the board).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, mode, puzzleType]);

  if (page === 'gallery') {
    return (
      <div className="app gallery-page">
        <Header />
        <Gallery />
        <Footer />
      </div>
    );
  }

  if (puzzleType === 'incremental' && mode === 'play') {
    return (
      <div className="app play">
        <Header />
        <main className="stage">
          <BoardTitle />
          <IncrementalPlayBoard />
        </main>
        <IncrementalPlayPanel />
        <Footer />
      </div>
    );
  }

  if (puzzleType === 'incremental' && mode === 'design') {
    return (
      <div className="app">
        <Header />
        <IncrementalParams />
        <main className="stage">
          <BoardTitle />
          <IncrementalBoard />
        </main>
        <IncrementalSide />
        <Footer />
      </div>
    );
  }

  return (
    <div className={mode === 'play' ? 'app play' : 'app'}>
      <Header />
      {mode === 'design' && <ParamsPanel board={board} puzzle={puzzle} />}
      <main className="stage">
        <BoardTitle />
        {loadError ? (
          <p className="error">
            {t.loadFailed} ({loadError})
          </p>
        ) : board ? (
          mode === 'play' ? (
            <PlayBoard board={board} puzzle={puzzle} />
          ) : (
            <BoardMap board={board} puzzle={puzzle} />
          )
        ) : (
          <p className="hint">{t.loading}</p>
        )}
      </main>
      {mode === 'play' ? (
        board && <PlayPanel board={board} puzzle={puzzle} />
      ) : (
        <SidePanel board={board} puzzle={puzzle} />
      )}
      <Footer />
    </div>
  );
}
