// English UI strings. This file defines the keys; other languages must provide the same keys
// with the same types (checked by TypeScript).

export const en = {
  appTitle: 'TSP Boards',
  appTagline: 'Puzzle boards: find the shortest round trip with nails and a string',
  language: 'Language',

  // Parameters
  parameters: 'Parameters',
  region: 'Region',
  cityCount: 'Cities',
  board: 'Board',
  boardWidth: 'Width (mm)',
  boardHeight: 'Height (mm)',
  margin: 'Margin (mm)',
  nailDiameter: 'Nail diameter (mm)',
  stringThickness: 'String thickness (mm)',
  minDistance: 'Min. distance (mm)',
  labelSize: 'Label size (mm, 0 = none)',
  labelLanguage: 'Board labels',
  labelsGerman: 'German names',
  labelsEnglish: 'English names',
  targetGap: 'Target gap (mm of string)',
  minPopulation: 'Min. population',
  seed: 'Seed',
  iterations: 'Iterations',
  weights: 'Weights',
  weightGap: 'Gap',
  weightDifficulty: 'Difficulty',
  weightRecognizability: 'Well-known cities',
  start: 'Start search',
  stop: 'Stop',
  poolSize: (count: string) => `${count} candidate cities`,

  // Search progress
  search: 'Search',
  idle: 'Not started',
  running: 'Searching…',
  done: 'Finished',
  stopped: 'Stopped',
  failed: 'Failed',
  progress: (iteration: string, total: string) => `Iteration ${iteration} of ${total}`,
  evaluations: 'Evaluations',
  exactChecks: 'Exact checks',
  temperature: 'Temperature',
  tooFew: (placed: string, n: string) =>
    `Only ${placed} cities fit at this minimum distance (need ${n}). Lower the number of cities or the minimum distance, or choose a larger region or board.`,
  pinConflict: (pairs: string) => `Pinned cities are closer than the minimum distance: ${pairs}`,
  trace: 'Progress of the search',
  traceGap: 'gap of the current state (mm)',
  traceQuality: 'quality of the best candidate',

  // Candidate metrics
  puzzle: 'Puzzle',
  showing: 'Showing',
  showCurrent: 'current state',
  showBest: 'best so far',
  showCandidate: (rank: string) => `candidate ${rank}`,
  showLoaded: 'puzzle from link',
  noPuzzle: 'No puzzle yet. Start a search.',
  gap: 'Gap to second-best tour',
  gapAtLeast: (value: string) => `≥ ${value} mm`,
  gapEstimate: 'Gap (local estimate)',
  euclideanGap: 'Gap without nail correction',
  stringLength: 'String length',
  euclideanLength: 'Tour length (nail centres)',
  difficulty: 'Difficulty',
  recognizability: 'Well-known cities',
  nearestNeighbor: 'Nearest neighbour (best start)',
  greedyEdge: 'Shortest edges first',
  hullInsertion: 'Convex hull + insertion',
  excess: (value: string) => `+${value} %`,
  verification: 'Verification',
  verifying: 'Exact check running…',
  queued: 'Exact check queued',
  stringExact: 'exact (string length)',
  euclidExactStringLocal: 'Euclidean exact, string checked locally',
  verificationFailed: 'Exact check failed',
  timeLimit: 'time limit reached',
  optimaDiffer:
    'Note: the optimal string tour differs from the shortest tour between nail centres.',
  showTour: 'Show tour',
  candidates: 'Candidates',
  candidateRow: (rank: string, gap: string) => `#${rank} · ${gap} mm`,
  marks: 'Pinned and excluded cities',
  marksHint:
    'Click a city on the board: pin it → exclude it → back to neutral. Applies to the next search.',
  marksSummary: (pinned: string, excluded: string) => `${pinned} pinned · ${excluded} excluded`,
  clearMarks: 'Clear',

  // Board export
  exportTitle: 'Board export',
  exportNeedsCheck: 'Available once the exact check of this puzzle has finished.',
  prepareBoard: 'Plan the board',
  planning: 'Placing start nail, scale and labels; checking the gap at the scale exactly…',
  planFailed: 'Planning failed',
  noScaleSpace:
    'No start nail has room for the measuring scale. Try a larger board margin or fewer cities near the edge.',
  startNail: 'Start nail',
  measuredGap: 'Gap at the scale',
  lowerBound: (value: string) => `≥ ${value} mm (bound)`,
  warnLabels: (count: string) => `${count} labels do not fit.`,
  warnTitle: 'There is no room for the title.',
  warnGap: (value: string) => `The gap at the scale (${value} mm) is below the target.`,
  warnOptimum:
    'Measured at the scale, another round trip would be shortest. Choose another candidate.',
  warnUnverified: 'The gap at the scale is only bounded: the exact check did not finish.',
  paper: 'Paper (print template)',
  holes: 'Nail holes',
  holesCut: 'cut (laser)',
  holesMark: 'mark for drilling',
  strokeWidth: 'SVG line width (mm)',
  previewBoard: 'Show the board as exported',
  downloadSvg: 'SVG for the laser cutter',
  downloadTemplate: 'Print template (PDF)',
  downloadSolution: 'Solution sheet (PDF)',
  exportHint:
    'SVG colours: red = cut, blue = score, green = outline (more power), black = engrave. Text is converted to outlines. The solution sheet explains how to calibrate the string.',

  // Permalink and data
  permalink: 'Copy link',
  linkCopied: 'Link copied',
  dataVersionMismatch: (linked: string, current: string) =>
    `This link was made with data version ${linked}; the app uses version ${current}. Cities may differ.`,
  missingCities: (ids: string) => `Cities from the link not found (GeoNames ids): ${ids}`,
  loading: 'Loading data…',
  loadFailed: 'Could not load the city data.',

  // Footer
  credits: 'Based on the MSc thesis of Nick Tchang, TU Dortmund (2026). Exact solver: HiGHS.',
  version: (app: string, data: string) => `Version ${app}, data version ${data}.`,
};

export type Messages = {
  readonly [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};
