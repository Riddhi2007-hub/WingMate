// Makes src/ts/dashboard/world.json (country outlines for the globe) from a GeoJSON file of countries.
//   node scripts/build-world.mjs path/to/countries.geo.json [tolerance-in-degrees]
// Source used: johan/world.geo.json (public domain, derived from Natural Earth). The output is committed, so this only needs
// running if the map is ever changed.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, tolArg] = process.argv;
if (!input) {
  console.error('usage: node scripts/build-world.mjs countries.geo.json [tolerance]');
  process.exit(1);
}
const tol = Number(tolArg ?? 0.3);
const geo = JSON.parse(readFileSync(input, 'utf8'));

/** Douglas-Peucker on [lon, lat] points. */
function simplify(points, eps) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let at = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > eps) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const out = [];
let pts = 0;
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    // only the outer ring of each polygon: lakes and holes do not matter at this size
    let ring = poly[0];
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
    const s = simplify(ring, tol);
    if (s.length < 3) continue;
    // flat list in tenths of a degree
    rings.push(s.flatMap(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]));
    pts += s.length;
  }
  if (rings.length) out.push([f.properties?.name ?? f.id ?? '', rings]);
}
writeFileSync(new URL('../src/ts/dashboard/world.json', import.meta.url), JSON.stringify(out));
console.log(`${out.length} countries, ${pts} points, tolerance ${tol}`);
