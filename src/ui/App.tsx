import { useEffect } from 'react';
import { useBoard } from './board';
import { BoardMap } from './components/BoardMap';
import { ParamsPanel } from './components/ParamsPanel';
import { PlayPanel } from './components/PlayPanel';
import { SidePanel } from './components/SidePanel';
import { loadData } from './controller';
import { useT } from './i18n';
import { usePuzzle } from './puzzle';
import { useStore, type Language } from './store';

function Header() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <header className="header">
      <div>
        <h1>{t.appTitle}</h1>
        <p className="tagline">{t.appTagline}</p>
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

  useEffect(() => {
    void loadData();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className={mode === 'play' ? 'app play' : 'app'}>
      <Header />
      {mode === 'design' && <ParamsPanel board={board} puzzle={puzzle} />}
      <main className="stage">
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
