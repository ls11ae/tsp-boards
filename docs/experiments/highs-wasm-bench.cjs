// Feasibility benchmark (2026-10-09): exact TSP + exact second-best tour with HiGHS compiled to WebAssembly.
// Originally run with highs@1.8.0; kept as a historical record. With the repository's pinned highs:
// node docs/experiments/highs-wasm-bench.cjs

// Feasibility check: exact TSP + exact second-best tour in WebAssembly (HiGHS),
// DFJ with iterative subtour elimination, plus a fast 2-opt/Or-opt heuristic.
const highsLoader = require('highs');

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makePoints(n, seed, clustered) {
  const r = rng(seed), P = [];
  if (!clustered) { for (let i = 0; i < n; i++) P.push([r(), r()]); return P; }
  const C = Array.from({ length: 6 }, () => [r(), r()]);
  for (let i = 0; i < n; i++) { const c = C[Math.floor(r() * C.length)];
    P.push([c[0] + (r() - 0.5) * 0.3, c[1] + (r() - 0.5) * 0.3]); }
  return P;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function components(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of edges) { adj[i].push(j); adj[j].push(i); }
  const seen = new Array(n).fill(false), comps = [];
  for (let s = 0; s < n; s++) if (!seen[s]) {
    const st = [s], c = []; seen[s] = true;
    while (st.length) { const v = st.pop(); c.push(v); for (const w of adj[v]) if (!seen[w]) { seen[w] = true; st.push(w); } }
    comps.push(c);
  }
  return comps;
}

async function exact(highs, P, extraCuts = []) {
  const n = P.length, v = (i, j) => `x_${i}_${j}`;
  const obj = [], cons = [], bin = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { obj.push(`${dist(P[i], P[j]).toFixed(6)} ${v(i, j)}`); bin.push(v(i, j)); }
  for (let i = 0; i < n; i++) { const t = []; for (let j = 0; j < n; j++) if (j !== i) t.push(v(Math.min(i, j), Math.max(i, j))); cons.push(`d${i}: ${t.join(' + ')} = 2`); }
  const cuts = [...extraCuts]; let rounds = 0;
  while (true) {
    rounds++;
    const lp = `Minimize\n obj: ${obj.join(' + ')}\nSubject To\n${cons.join('\n')}\n${cuts.map((c, k) => `c${k}: ${c}`).join('\n')}\nBinary\n ${bin.join(' ')}\nEnd\n`;
    const res = highs.solve(lp, { mip_rel_gap: 0 });
    if (res.Status !== 'Optimal') throw new Error(res.Status);
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (res.Columns[v(i, j)].Primal > 0.5) edges.push([i, j]);
    const comps = components(n, edges);
    if (comps.length === 1) return { len: res.ObjectiveValue, edges, rounds, cuts };
    for (const S of comps) { const t = []; for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) t.push(v(Math.min(S[a], S[b]), Math.max(S[a], S[b]))); cuts.push(`${t.join(' + ')} <= ${S.length - 1}`); }
  }
}

function tourLen(P, t) { let L = 0; for (let i = 0; i < t.length; i++) L += dist(P[t[i]], P[t[(i + 1) % t.length]]); return L; }
function localSearch(P, t) { // 2-opt + Or-opt until local optimum
  const n = t.length; let improved = true;
  while (improved) { improved = false;
    for (let i = 0; i < n - 1; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = P[t[i]], b = P[t[i + 1]], c = P[t[j]], d = P[t[(j + 1) % n]];
      if (dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 1e-12) { let l = i + 1, r = j; while (l < r) { [t[l], t[r]] = [t[r], t[l]]; l++; r--; } improved = true; }
    }
    for (let seg = 1; seg <= 3 && !improved; seg++) for (let i = 0; i < n && !improved; i++) {
      const s = []; for (let k = 0; k < seg; k++) s.push(t[(i + k) % n]);
      const rest = t.filter(x => !s.includes(x)), base = tourLen(P, t);
      for (let p = 0; p < rest.length && !improved; p++) for (const ss of [s, [...s].reverse()]) {
        const cand = [...rest.slice(0, p + 1), ...ss, ...rest.slice(p + 1)];
        if (tourLen(P, cand) < base - 1e-9) { t.splice(0, n, ...cand); improved = true; break; }
      }
    }
  }
  return t;
}
function heuristic(P, starts, seed) {
  const r = rng(seed); let best = Infinity;
  for (let s = 0; s < starts; s++) { const t = [...Array(P.length).keys()].sort(() => r() - 0.5); localSearch(P, t); best = Math.min(best, tourLen(P, t)); }
  return best;
}

(async () => {
  const highs = await highsLoader();
  for (const [n, clustered] of [[40, false], [50, false], [60, false], [40, true], [50, true]]) {
    let tOpt = 0, tSecond = 0, tHeur = 0, hits = 0, gaps = []; const trials = 5;
    for (let s = 0; s < trials; s++) {
      const P = makePoints(n, 100 + s, clustered);
      let t0 = performance.now(); const opt = await exact(highs, P); tOpt += performance.now() - t0;
      // second-best: forbid the optimal edge set (no-good cut), keep collected subtour cuts
      t0 = performance.now();
      const nogood = opt.edges.map(([i, j]) => `x_${i}_${j}`).join(' + ') + ` <= ${n - 1}`;
      const second = await exact(highs, P, [...opt.cuts, nogood]); tSecond += performance.now() - t0;
      gaps.push(100 * (second.len - opt.len) / opt.len);
      t0 = performance.now(); const h = heuristic(P, 20, s); tHeur += performance.now() - t0;
      if (Math.abs(h - opt.len) < 1e-6) hits++;
    }
    console.log(`n=${n}${clustered ? ' clustered' : ''}: OPT ${(tOpt / trials).toFixed(0)} ms, 2nd-best ${(tSecond / trials).toFixed(0)} ms, ` +
      `heuristic(20 starts) ${(tHeur / trials).toFixed(0)} ms, heuristic=OPT ${hits}/${trials}, gap ${gaps.map(g => g.toFixed(2)).join('/')} %`);
  }
})();
