// Versors (unit quaternions) for rotating a globe by dragging (roadmap 9.3): the point under the
// pointer stays under the pointer, and the rotation does not get stuck at the poles as with
// longitude/latitude angles. After Mike Bostock's d3 versor (ISC licence).

/** [λ, φ, γ] in degrees, as d3-geo's projection.rotate(). */
export type Rotation = readonly [number, number, number];
export type Versor = readonly [number, number, number, number];
type Vec3 = readonly [number, number, number];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Unit vector of a point given as [longitude, latitude] in degrees. */
export function cartesian([lon, lat]: readonly [number, number]): Vec3 {
  const l = lon * RAD;
  const p = lat * RAD;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

/** Versor of the rotation [λ, φ, γ]. */
export function versor([l0, p0, g0]: Rotation): Versor {
  const l = (l0 / 2) * RAD;
  const p = (p0 / 2) * RAD;
  const g = (g0 / 2) * RAD;
  const [sl, cl] = [Math.sin(l), Math.cos(l)];
  const [sp, cp] = [Math.sin(p), Math.cos(p)];
  const [sg, cg] = [Math.sin(g), Math.cos(g)];
  return [
    cl * cp * cg + sl * sp * sg,
    sl * cp * cg - cl * sp * sg,
    cl * sp * cg + sl * cp * sg,
    cl * cp * sg - sl * sp * cg,
  ];
}

/** Rotation [λ, φ, γ] of a versor. */
export function rotation([a, b, c, d]: Versor): Rotation {
  return [
    Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c)) * DEG,
    Math.asin(Math.max(-1, Math.min(1, 2 * (a * c - d * b)))) * DEG,
    Math.atan2(2 * (a * d + b * c), 1 - 2 * (c * c + d * d)) * DEG,
  ];
}

/** Versor that turns unit vector v0 onto v1. */
export function delta(v0: Vec3, v1: Vec3): Versor {
  const w: Vec3 = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ];
  const l = Math.hypot(...w);
  if (!l) return [1, 0, 0, 0];
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const t = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
  const s = Math.sin(t);
  return [Math.cos(t), (w[2] / l) * s, (-w[1] / l) * s, (w[0] / l) * s];
}

/** Product q0·q1: first q1, then q0. */
export function multiply([a1, b1, c1, d1]: Versor, [a2, b2, c2, d2]: Versor): Versor {
  return [
    a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2,
    a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
    a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2,
    a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
  ];
}
