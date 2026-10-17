// The globe in play mode and in the designer for world puzzles (roadmap 9.3), and the switch
// between globe and Equal Earth map.

import { listName } from '../../core/data';
import { boardLabel } from '../../core/data';
import { shownRoute, usePathCities, type BoardModel } from '../board';
import { computerDrawing, skipAnimation, useRounds } from '../computer';
import { cycleCity } from '../controller';
import { useT } from '../i18n';
import { useOverlay } from '../overlay';
import { playClick } from '../play';
import type { PuzzleView } from '../puzzle';
import { useStore } from '../store';
import { Globe, type GlobePlace, type GlobeRoute } from './Globe';

export function ViewSwitch() {
  const t = useT();
  const view = useStore((s) => s.worldView);
  const set = (worldView: 'globe' | 'map') => useStore.setState({ worldView, flight: null });
  return (
    <div className="segmented" role="group" aria-label={t.viewGlobe}>
      <button
        type="button"
        className={view === 'globe' ? 'selected' : undefined}
        aria-pressed={view === 'globe'}
        onClick={() => set('globe')}
      >
        {t.viewGlobe}
      </button>
      <button
        type="button"
        className={view === 'map' ? 'selected' : undefined}
        aria-pressed={view === 'map'}
        onClick={() => set('map')}
      >
        {t.viewMap}
      </button>
    </div>
  );
}

export function PlayGlobe({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const play = useStore((s) => s.play);
  const lang = useStore((s) => s.lang);
  const flight = useStore((s) => s.flight);
  const overlay = useOverlay(board, puzzle);
  const members = puzzle?.members ?? [];
  const ends = usePathCities(board, puzzle?.members);
  const visited = new Set(play.state.path);
  const places: GlobePlace[] = members.map((c, slot) => {
    const city = board.pool[c]!;
    const state = (ends ? c === ends[0] : play.state.path[0] === slot)
      ? 'start'
      : ends && c === ends[1]
        ? 'finish'
        : visited.has(slot)
          ? 'visited'
          : '';
    return {
      city: c,
      label: boardLabel(city, lang),
      title: listName(city, lang),
      className: state,
      ring: city.highlight === true,
    };
  });
  const revealed = play.revealed;
  const routes: GlobeRoute[] = [];
  // The given leg of an open path (roadmap 9.15), dashed.
  if (ends) routes.push({ cities: [ends[1], ends[0]], closed: false, className: 'given-leg' });
  // "So rechnet der Computer" (roadmap 9.18) instead of the game's tours.
  const computer = useStore((s) => s.computer);
  useRounds((s) => s.byKey);
  const drawing = computer && puzzle ? computerDrawing(board, puzzle, computer, play.best) : null;
  if (drawing) {
    if (drawing.route) routes.push({ ...drawing.route, className: 'computer-tour' });
    routes.push({ cities: [], closed: false, edges: drawing.edges, className: 'teach-edge' });
    routes.push({ cities: [], closed: false, edges: drawing.highlight, className: 'teach-hl' });
  }
  const solution = !drawing && revealed && puzzle?.tour;
  if (solution) routes.push({ ...shownRoute(puzzle.tour, ends), className: 'solution-tour' });
  const comparing = !drawing && overlay && (revealed || play.solvedMs !== null);
  if (comparing)
    routes.push({ cities: overlay.tour, closed: overlay.closed, className: 'overlay-tour' });
  // During a flight only the solution and the flown legs are drawn; next to the solution and a
  // comparison the own tour would be a third one.
  if (play.state.path.length > 1 && !flight && !drawing && !(comparing && solution))
    routes.push({
      cities: play.state.path.map((s) => members[s]!),
      closed: play.state.closed && !ends,
      className: revealed ? 'play-path dashed' : 'play-path',
    });
  return (
    <Globe
      className="play-board globe"
      board={board}
      places={places}
      routes={routes}
      onPick={(c) => {
        if (skipAnimation()) return;
        const slot = members.indexOf(c);
        if (puzzle && slot >= 0) playClick(puzzle, slot);
      }}
      flight={flight}
      onFlightEnd={() => useStore.setState({ flight: null })}
      controls={<ViewSwitch />}
    />
  );
}

export function DesignGlobe({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView | null;
}) {
  const lang = useStore((s) => s.lang);
  const showTour = useStore((s) => s.showTour);
  const pinned = useStore((s) => s.pinned);
  const excluded = useStore((s) => s.excluded);
  const overlay = useOverlay(board, puzzle);
  const members = puzzle?.members ?? [];
  const inPuzzle = new Set(members);
  const marked = (c: number) => {
    const id = board.pool[c]!.id;
    return pinned.includes(id) ? 'pinned' : excluded.includes(id) ? 'excluded' : '';
  };
  const places: GlobePlace[] = members.map((c) => {
    const city = board.pool[c]!;
    return {
      city: c,
      label: boardLabel(city, lang),
      title: listName(city, lang),
      className: marked(c),
      ring: city.highlight === true,
    };
  });
  // Pinned or excluded towns outside the puzzle stay visible as places.
  for (const c of board.pool.keys()) {
    if (!inPuzzle.has(c) && marked(c)) {
      const city = board.pool[c]!;
      places.push({
        city: c,
        label: boardLabel(city, lang),
        title: listName(city, lang),
        className: marked(c),
      });
    }
  }
  const ends = usePathCities(board, puzzle?.members);
  const routes: GlobeRoute[] = [];
  if (ends) routes.push({ cities: [ends[1], ends[0]], closed: false, className: 'given-leg' });
  if (showTour && puzzle?.tour)
    routes.push({ ...shownRoute(puzzle.tour, ends), className: 'tour' });
  if (overlay)
    routes.push({ cities: overlay.tour, closed: overlay.closed, className: 'overlay-tour' });
  return (
    <Globe
      className="board-globe globe"
      board={board}
      places={places}
      routes={routes}
      dots={[...board.pool.keys()].filter((c) => !inPuzzle.has(c))}
      onPick={(c) => cycleCity(board.pool[c]!.id)}
      controls={<ViewSwitch />}
    />
  );
}
