import { useEffect } from 'react';
import { useBoard } from './board';
import { BoardMap } from './components/BoardMap';
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
  const puzzleType = useStore((s) => s.puzzleType);
  const setPuzzleType = useStore((s) => s.setPuzzleType);
  const types: [PuzzleType, string][] = [
    ['map', t.mapPuzzle],
    ['incremental', t.incrementalPuzzle],
  ];
  return (
    <header className="header">
      <div>
        <h1>{t.appTitle}</h1>
        <p className="tagline">{t.appTagline}</p>
      </div>
      {mode === 'design' && (
        <div className="lang" role="group" aria-label={t.puzzleType}>
          {types.map(([type, label]) => (
            <button
              key={type}
              type="button"
              className={type === puzzleType ? 'selected' : undefined}
              aria-pressed={type === puzzleType}
              onClick={() => setPuzzleType(type)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
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
  const puzzleType = useStore((s) => s.puzzleType);

  useEffect(() => {
    void loadData();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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
          <BoardMap board={board} puzzle={puzzle} />
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
