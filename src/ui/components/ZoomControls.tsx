// Zoom buttons of a play board (see zoom.ts).

import { useT } from '../i18n';

export function ZoomControls({
  zoomBy,
  fit,
}: {
  readonly zoomBy: (factor: number) => void;
  readonly fit: () => void;
}) {
  const t = useT();
  return (
    <div className="zoom-controls">
      <button type="button" onClick={() => zoomBy(0.7)} aria-label={t.zoomIn}>
        +
      </button>
      <button type="button" onClick={() => zoomBy(1 / 0.7)} aria-label={t.zoomOut}>
        −
      </button>
      <button type="button" onClick={fit} aria-label={t.zoomFit}>
        ⤢
      </button>
    </div>
  );
}
