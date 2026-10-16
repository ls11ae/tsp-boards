import { geoOrthographic } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { cartesian, delta, multiply, rotation, versor } from './versor';

describe('versors', () => {
  it('round-trip a rotation', () => {
    const r = rotation(versor([40, -25, 10]));
    expect(r[0]).toBeCloseTo(40, 9);
    expect(r[1]).toBeCloseTo(-25, 9);
    expect(r[2]).toBeCloseTo(10, 9);
  });

  it('keep the grabbed point under the pointer while dragging the globe', () => {
    const r0 = [-20, -40, 0] as const;
    const at = (r: readonly [number, number, number]) =>
      geoOrthographic()
        .rotate([...r])
        .translate([200, 200])
        .scale(150)
        .clipAngle(90);
    const grab: [number, number] = [210, 190];
    const to: [number, number] = [260, 230];
    const p0 = at(r0).invert!(grab)!;
    const p1 = at(r0).invert!(to)!;
    const r1 = rotation(multiply(versor(r0), delta(cartesian(p0), cartesian(p1))));
    const [x, y] = at(r1)(p0)!;
    expect(x).toBeCloseTo(to[0], 6);
    expect(y).toBeCloseTo(to[1], 6);
    expect(delta(cartesian(p0), cartesian(p0))).toEqual([1, 0, 0, 0]);
  });
});
