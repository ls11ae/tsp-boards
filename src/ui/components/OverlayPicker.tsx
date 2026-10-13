// Choice of the comparison tour on the board (runner-up or a simple strategy) and what it
// costs compared with the optimum.

import type { BoardModel } from '../board';
import { useFormat, useT } from '../i18n';
import { useOverlay } from '../overlay';
import type { PuzzleView } from '../puzzle';
import { useStore, type OverlayChoice } from '../store';

export function OverlayPicker({
  board,
  puzzle,
}: {
  readonly board: BoardModel;
  readonly puzzle: PuzzleView;
}) {
  const t = useT();
  const fmt = useFormat();
  const kind = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const digital = useStore((s) => s.doc.purpose === 'digital');
  const overlay = useOverlay(board, puzzle);
  const v = puzzle.verification;
  const hasSecond = v?.status === 'done' && Boolean(v.verification.string?.second);
  const options: readonly [OverlayChoice, string][] = [
    ['none', t.overlayNone],
    ['second', t.overlaySecond],
    ['nearest-neighbor', t.nearestNeighbor],
    ['greedy-edge', t.greedyEdge],
    ['hull-insertion', t.hullInsertion],
  ];
  let text: string | null = null;
  if (overlay) {
    const pct = fmt.number((100 * overlay.excessUm) / overlay.optimumUm, 2);
    const longer = digital
      ? t.gapDigital(pct, fmt.number(overlay.excessUm / 1000 / board.projection.mmPerKm, 1))
      : `${fmt.number(overlay.excessUm / 1000, 2)} mm (${pct} %)`;
    text =
      overlay.added.length === 0
        ? t.overlaySame
        : t.overlayDiff(fmt.integer(overlay.added.length), longer);
  }
  return (
    <div className="overlay-picker">
      <label className="field">
        <span>{t.overlay}</span>
        <select value={kind} onChange={(e) => setOverlay(e.target.value as OverlayChoice)}>
          {options.map(([value, label]) => (
            <option key={value} value={value} disabled={value === 'second' && !hasSecond}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {kind === 'second' && !hasSecond && <p className="hint">{t.overlayNeedsCheck}</p>}
      {text && <p className="hint">{text}</p>}
      {overlay && overlay.added.length > 0 && (
        <p className="legend">
          <span className="swatch overlay-added" /> {t.overlayAdded}{' '}
          <span className="swatch overlay-removed" /> {t.overlayRemoved}
        </p>
      )}
    </div>
  );
}
