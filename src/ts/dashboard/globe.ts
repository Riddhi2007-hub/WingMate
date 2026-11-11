/**
 * The globe beside the ticket. A small canvas renderer (no libraries): an orthographic globe with country outlines,
 * the AirAsia network as glowing dots, and, once a flight is saved, an animated trip: the globe turns to the departure
 * airport, a plane flies the great-circle route drawing a glowing trail, then the view settles on the whole route.
 * Drag to spin it, tap an airport to see its name. With "reduce motion" on, it just shows the finished route.
 */
import world from './world.json';
import { AIRPORTS, airportByCode, type Airport } from './airports';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

type Vec = [number, number, number];
const fromLonLat = (lon: number, lat: number): Vec => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lonOf = (v: Vec): number => Math.atan2(v[1], v[0]) * DEG;
const latOf = (v: Vec): number => Math.asin(Math.max(-1, Math.min(1, v[2]))) * DEG;
const wrap = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const easeInOut = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function slerp(a: Vec, b: Vec, t: number): Vec {
  const d = clamp(dot(a, b), -1, 1);
  const w = Math.acos(d);
  if (w < 1e-6) return a;
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/* ---------- the map data ---------- */

interface Ring {
  /** lon, lat pairs in degrees */
  ll: Float32Array;
  /** the same points as unit vectors (x, y, z) */
  xyz: Float32Array;
}
interface Country {
  name: string;
  rings: Ring[];
}

const COUNTRIES: Country[] = (world as unknown as Array<[string, number[][]]>).map(([name, rings]) => ({
  name,
  rings: rings.map((flat) => {
    const n = flat.length / 2;
    const ll = new Float32Array(n * 2);
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const lon = (flat[i * 2] ?? 0) / 10;
      const lat = (flat[i * 2 + 1] ?? 0) / 10;
      ll[i * 2] = lon;
      ll[i * 2 + 1] = lat;
      const v = fromLonLat(lon, lat);
      xyz[i * 3] = v[0];
      xyz[i * 3 + 1] = v[1];
      xyz[i * 3 + 2] = v[2];
    }
    return { ll, xyz };
  }),
}));

function insideRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  const n = ring.ll.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring.ll[i * 2] ?? 0;
    const yi = ring.ll[i * 2 + 1] ?? 0;
    const xj = ring.ll[j * 2] ?? 0;
    const yj = ring.ll[j * 2 + 1] ?? 0;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country (index into COUNTRIES) an airport is in, or -1. */
function countryAt(lon: number, lat: number): number {
  for (let i = 0; i < COUNTRIES.length; i++) {
    for (const ring of COUNTRIES[i]?.rings ?? []) if (insideRing(ring, lon, lat)) return i;
  }
  return -1;
}

/* ---------- routes ---------- */

interface Route {
  from: Airport;
  to: Airport;
  a: Vec;
  b: Vec;
  /** angle between the airports, in degrees */
  span: number;
  /** points along the great circle, from departure to arrival */
  line: Vec[];
  countries: Set<number>;
  /** how long the flying part of the animation takes */
  flyMs: number;
}

const SAMPLES = 140;
const TURN_MS = 1400;
const SETTLE_MS = 1300;
const LOOP_MS = 7600;
const LOOP_FLY_MS = 3400;

function makeRoute(from: Airport, to: Airport): Route {
  const a = fromLonLat(from.lon, from.lat);
  const b = fromLonLat(to.lon, to.lat);
  const span = Math.acos(clamp(dot(a, b), -1, 1)) * DEG;
  const line: Vec[] = [];
  for (let i = 0; i <= SAMPLES; i++) line.push(slerp(a, b, i / SAMPLES));
  const countries = new Set<number>();
  for (const ap of [from, to]) {
    const idx = countryAt(ap.lon, ap.lat);
    if (idx >= 0) countries.add(idx);
  }
  return { from, to, a, b, span, line, countries, flyMs: clamp(2300 + span * 12, 2600, 4400) };
}

/** Height of the plane above the ground at progress t (0..1), as a fraction of the globe radius. */
const lift = (t: number, span: number): number => 0.035 + 0.2 * Math.sin(Math.PI * t) * clamp(span / 110, 0.3, 1);

/* AirAsia-style network lines shown while there is no flight yet */
const AMBIENT: Array<[string, string]> = [['KUL', 'HKG'], ['KUL', 'CCU'], ['BKK', 'HKG'], ['SIN', 'DPS'], ['KUL', 'HND'], ['MNL', 'HKG'], ['CCU', 'BKK'], ['KUL', 'SYD'], ['DEL', 'KUL'], ['SGN', 'KUL']];

interface View {
  lon: number;
  lat: number;
  scale: number;
}

const PLANE = typeof Path2D === 'undefined' ? null : new Path2D('M12 2l2 8 8 4v2l-8-2-1 6 3 2v2l-4-1-4 1v-2l3-2-1-6-8 2v-2l8-4z');

export interface GlobeApi {
  setRoute(from: string | null, to: string | null, play?: boolean): void;
  replay(): void;
}

export function initGlobe(host: HTMLElement): GlobeApi {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas');
  const ctx = canvas?.getContext('2d') ?? null;
  const note = host.querySelector<HTMLElement>('[data-globe-note]');
  if (!canvas || !ctx) return { setRoute() {}, replay() {} };
  const c2d: CanvasRenderingContext2D = ctx;

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ambient = AMBIENT.map(([x, y]) => {
    const f = airportByCode(x);
    const t = airportByCode(y);
    return f && t ? makeRoute(f, t) : null;
  }).filter((r): r is Route => r !== null);
  const pins = AIRPORTS.map((ap) => ({ ap, v: fromLonLat(ap.lon, ap.lat), x: 0, y: 0, z: 0 }));

  let w = 0;
  let h = 0;
  let dpr = 1;
  let route: Route | null = null;
  let routeStart = 0;
  let cam: View = { lon: 100, lat: 18, scale: 1 };
  let userUntil = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  let spin = 0;
  /** Zoom the person asked for (buttons, pinch, trackpad), on top of the camera's own zoom. */
  let zoom = 1;
  let zoomTarget = 1;
  const MAX_ZOOM = 4;
  const setZoom = (z: number): void => {
    zoomTarget = clamp(z, 1, MAX_ZOOM);
    userUntil = performance.now() + 4000;
    glideTo = null;
    kick();
  };
  let hover: (typeof pins)[number] | null = null;
  let pinned: (typeof pins)[number] | null = null;
  let glideTo: View | null = null;
  let glideUntil = 0;
  let raf = 0;
  let visible = false;
  let last = 0;

  const radius = (): number => Math.min(w, h) * 0.47;

  function resize(): void {
    const rect = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.round(rect.width);
    h = Math.round(rect.height);
    canvas!.width = Math.max(1, Math.round(w * dpr));
    canvas!.height = Math.max(1, Math.round(h * dpr));
    if (visible) kick();
  }

  /* ---------- the view of the route over time ---------- */

  /** Where the camera should be at `t` ms into the trip, and how far the plane has got. */
  function timeline(t: number, r: Route): { view: View; draw: number; plane: number; phase: 'turn' | 'fly' | 'settle' | 'loop' } {
    const mid = slerp(r.a, r.b, 0.5);
    const zoom = clamp(0.6 / Math.sin(Math.max(0.12, (r.span / 2) * RAD)), 1, 1.55);
    const dep: View = { lon: r.from.lon, lat: clamp(r.from.lat * 0.8 + 6, -55, 55), scale: 1.12 };
    const over: View = { lon: lonOf(mid), lat: latOf(mid) * 0.9 + 4, scale: zoom };
    if (t < TURN_MS) return { view: { ...dep }, draw: 0, plane: 0, phase: 'turn' };
    const f = t - TURN_MS;
    if (f < r.flyMs) {
      const p = easeInOut(f / r.flyMs);
      const g = slerp(r.a, r.b, p);
      return { view: { lon: lonOf(g), lat: latOf(g) * 0.9 + 4, scale: 1.12 - (1.12 - zoom) * p }, draw: p, plane: p, phase: 'fly' };
    }
    const s = f - r.flyMs;
    if (s < SETTLE_MS) return { view: over, draw: 1, plane: 1, phase: 'settle' };
    const lt = (s - SETTLE_MS) % LOOP_MS;
    const sway = Math.sin(((s - SETTLE_MS) / 4200) * Math.PI) * 4;
    return { view: { ...over, lon: over.lon + sway }, draw: 1, plane: clamp(lt / LOOP_FLY_MS, 0, 1), phase: 'loop' };
  }

  /* ---------- drawing ---------- */

  function frame(now: number): void {
    raf = 0;
    if (!visible || w < 10) return;
    const dt = Math.min(64, now - (last || now));
    last = now;
    const userActive = dragging || now < userUntil;
    zoom += (zoomTarget - zoom) * (reduced ? 1 : 1 - Math.exp(-dt / 110));
    if (Math.abs(zoomTarget - zoom) < 0.002) zoom = zoomTarget;

    let target: View | null = null;
    let draw = 0;
    let plane = 0;
    let phase = 'idle';
    if (route) {
      const t = reduced ? 1e9 : now - routeStart;
      const tl = timeline(t, route);
      target = tl.view;
      draw = tl.draw;
      plane = tl.plane;
      phase = tl.phase;
    }
    if (glideTo && now < glideUntil) target = glideTo;

    if (!userActive) {
      if (target) {
        const k = reduced ? 1 : 1 - Math.exp(-dt / (phase === 'fly' ? 90 : 220));
        cam = { lon: cam.lon + wrap(target.lon - cam.lon) * k, lat: cam.lat + (target.lat - cam.lat) * k, scale: cam.scale + (target.scale - cam.scale) * k };
      } else if (!reduced) {
        cam = { lon: wrap(cam.lon + dt * 0.006), lat: cam.lat + (16 - cam.lat) * 0.02, scale: cam.scale + (1 - cam.scale) * 0.04 };
      }
    } else if (!dragging && Math.abs(spin) > 0.002) {
      cam.lon = wrap(cam.lon + spin * dt);
      spin *= 0.94;
    }

    render(now, draw, plane, phase);
    // keep going while there is something moving
    kick();
  }

  function kick(): void {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function render(now: number, draw: number, plane: number, phase: string): void {
    const g = c2d;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const R = radius() * cam.scale * zoom;
    const cx = w / 2;
    const cy = h / 2;

    // screen axes for the current view
    const lon0 = cam.lon * RAD;
    const lat0 = cam.lat * RAD;
    const ex = -Math.sin(lon0);
    const ey = Math.cos(lon0);
    const nx = -Math.sin(lat0) * Math.cos(lon0);
    const ny = -Math.sin(lat0) * Math.sin(lon0);
    const nz = Math.cos(lat0);
    const zx = Math.cos(lat0) * Math.cos(lon0);
    const zy = Math.cos(lat0) * Math.sin(lon0);
    const zz = Math.sin(lat0);
    // returns screen x, y and depth (depth > 0 means facing us); `up` lifts the point off the ground
    const proj = (v: Vec, up = 0): [number, number, number] => {
      const k = 1 + up;
      return [cx + (v[0] * ex + v[1] * ey) * R * k, cy - (v[0] * nx + v[1] * ny + v[2] * nz) * R * k, v[0] * zx + v[1] * zy + v[2] * zz];
    };

    // glow around the planet
    const glow = g.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.16);
    glow.addColorStop(0, 'rgba(255,214,205,.38)');
    glow.addColorStop(1, 'rgba(255,214,205,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
    g.fill();

    // ocean
    const sea = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.1);
    sea.addColorStop(0, '#b0467f');
    sea.addColorStop(0.5, '#5e1c4f');
    sea.addColorStop(1, '#260b2a');
    g.fillStyle = sea;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();

    // graticule
    g.lineWidth = 0.7;
    g.strokeStyle = 'rgba(255,255,255,.09)';
    g.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) line((i) => fromLonLat(i * 6 - 180, lat), 61);
    for (let lon = -180; lon < 180; lon += 30) line((i) => fromLonLat(lon, i * 3 - 90), 61);
    g.stroke();

    // countries: fill (back-facing points are pushed to the edge so shapes stay closed), then outlines on the visible side only
    for (let ci = 0; ci < COUNTRIES.length; ci++) {
      const lit = route?.countries.has(ci) ?? false;
      for (const ring of COUNTRIES[ci]!.rings) {
        const n = ring.xyz.length / 3;
        let any = false;
        const px = new Float32Array(n);
        const py = new Float32Array(n);
        const pz = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const v: Vec = [ring.xyz[i * 3]!, ring.xyz[i * 3 + 1]!, ring.xyz[i * 3 + 2]!];
          const [x, y, z] = proj(v);
          px[i] = x;
          py[i] = y;
          pz[i] = z;
          if (z > -0.05) any = true;
        }
        if (!any) continue;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          let x = px[i]!;
          let y = py[i]!;
          if (pz[i]! < 0) {
            const dx = x - cx;
            const dy = y - cy;
            const m = Math.hypot(dx, dy) || 1;
            x = cx + (dx / m) * R;
            y = cy + (dy / m) * R;
          }
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = lit ? 'rgba(255,196,170,.5)' : 'rgba(255,255,255,.17)';
        g.fill();
        g.beginPath();
        let open = false;
        for (let i = 0; i <= n; i++) {
          const k = i % n;
          if (pz[k]! > 0) {
            if (!open) {
              g.moveTo(px[k]!, py[k]!);
              open = true;
            } else g.lineTo(px[k]!, py[k]!);
          } else open = false;
        }
        g.lineWidth = lit ? 1.1 : 0.7;
        g.strokeStyle = lit ? 'rgba(255,238,228,.95)' : 'rgba(255,255,255,.55)';
        g.stroke();
      }
    }

    // soft light from the top left and a darker rim, for depth
    const shine = g.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 0, cx - R * 0.4, cy - R * 0.45, R * 1.1);
    shine.addColorStop(0, 'rgba(255,255,255,.2)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    const rim = g.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
    rim.addColorStop(0, 'rgba(10,0,14,0)');
    rim.addColorStop(1, 'rgba(10,0,14,.5)');
    g.fillStyle = rim;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.restore();

    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();

    // helper used for lines on the sphere: draws only the facing parts
    function line(at: (i: number) => Vec, count: number, up = 0): void {
      let open = false;
      for (let i = 0; i < count; i++) {
        const [x, y, z] = proj(at(i), up);
        if (z > 0) {
          if (!open) {
            g.moveTo(x, y);
            open = true;
          } else g.lineTo(x, y);
        } else open = false;
      }
    }

    // network dots (positions are kept for hovering)
    for (const p of pins) {
      const [x, y, z] = proj(p.v);
      p.x = x;
      p.y = y;
      p.z = z;
    }
    const onRoute = (ap: Airport): boolean => route !== null && (ap.code === route.from.code || ap.code === route.to.code);

    if (!route) {
      // ambient network: faint dotted routes with a small light travelling along each
      g.lineWidth = 1;
      g.setLineDash([1.5, 5]);
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.beginPath();
      for (const r of ambient) line((i) => r.line[i]!, SAMPLES + 1, 0);
      g.stroke();
      g.setLineDash([]);
      ambient.forEach((r, i) => {
        const p = ((now / 5200 + i * 0.173) % 1) * 1;
        const idx = Math.min(SAMPLES, Math.floor(p * SAMPLES));
        const [x, y, z] = proj(r.line[idx]!, lift(p, r.span) * 0.6);
        if (z > 0.05) {
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.beginPath();
          g.arc(x, y, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      });
    }

    for (const p of pins) {
      if (p.z <= 0.02 || onRoute(p.ap)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now / 700 + p.ap.lon);
      g.fillStyle = `rgba(255,236,226,${route ? 0.5 : 0.65 + pulse * 0.3})`;
      g.beginPath();
      g.arc(p.x, p.y, (route ? 1.7 : 2.2) * Math.min(1.8, 0.7 + zoom * 0.3), 0, Math.PI * 2);
      g.fill();
    }

    if (route) {
      const r = route;
      // guide on the ground, then the lifted arc drawn up to the plane
      g.lineWidth = 1;
      g.setLineDash([1.5, 4.5]);
      g.strokeStyle = 'rgba(255,255,255,.4)';
      g.beginPath();
      line((i) => r.line[i]!, SAMPLES + 1, 0);
      g.stroke();
      g.setLineDash([]);

      const upTo = Math.floor(draw * SAMPLES);
      const trailTo = phase === 'loop' ? Math.floor(plane * SAMPLES) : upTo;
      const trailFrom = phase === 'loop' ? Math.max(0, trailTo - Math.floor(SAMPLES * 0.55)) : 0;
      const seg = (i: number): Vec => r.line[trailFrom + i]!;
      const count = Math.max(0, trailTo - trailFrom + 1);
      for (const [lw, col] of [[7, 'rgba(255,255,255,.14)'], [3.4, 'rgba(255,225,215,.4)'], [1.8, 'rgba(255,255,255,.98)']] as const) {
        g.lineWidth = lw;
        g.lineCap = 'round';
        g.strokeStyle = col;
        g.beginPath();
        let open = false;
        for (let i = 0; i < count; i++) {
          const t = (trailFrom + i) / SAMPLES;
          const [x, y, z] = proj(seg(i), lift(t, r.span));
          if (z > 0) {
            if (!open) {
              g.moveTo(x, y);
              open = true;
            } else g.lineTo(x, y);
          } else open = false;
        }
        g.stroke();
      }

      // airport markers with a ripple
      const popA = easeOut((phase === 'turn' ? clamp((now - routeStart) / TURN_MS, 0, 1) : 1));
      const popB = easeOut(clamp((draw - 0.96) / 0.04, 0, 1));
      marker(r.from, popA, now, true);
      if (popB > 0) marker(r.to, popB, now, false);

      // the plane, with its shadow on the ground
      if (draw > 0 && PLANE) {
        const t = clamp(phase === 'loop' ? plane : draw, 0, 1);
        const i = Math.min(SAMPLES - 1, Math.floor(t * SAMPLES));
        const j = Math.min(SAMPLES, i + 1);
        const hi = lift(t, r.span);
        const [x, y, z] = proj(r.line[i]!, hi);
        const [x2, y2] = proj(r.line[j]!, lift(j / SAMPLES, r.span));
        if (z > 0.02 && !(phase === 'loop' && (plane <= 0 || plane >= 1))) {
          const [sx, sy] = proj(r.line[i]!, 0);
          g.fillStyle = 'rgba(0,0,0,.28)';
          g.beginPath();
          g.ellipse(sx, sy + 3, 5, 2.2, 0, 0, Math.PI * 2);
          g.fill();
          const angle = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
          const size = clamp(R * 0.14, 15, 26);
          g.save();
          g.translate(x, y);
          g.rotate(angle);
          g.scale(size / 24, size / 24);
          g.translate(-12, -12);
          g.shadowColor = 'rgba(255,255,255,.9)';
          g.shadowBlur = 10;
          g.fillStyle = '#fff';
          g.fill(PLANE);
          g.restore();
        }
      }
    }

    // tooltip for the airport under the finger or mouse
    const tip = pinned ?? hover;
    if (tip && tip.z > 0.05) {
      const text = `${tip.ap.code} · ${tip.ap.city}`;
      g.font = '600 12px system-ui, sans-serif';
      const tw = g.measureText(text).width + 16;
      const tx = clamp(tip.x + 10, 4, w - tw - 4);
      const ty = clamp(tip.y - 30, 4, h - 28);
      g.fillStyle = 'rgba(20,6,24,.82)';
      g.beginPath();
      g.roundRect(tx, ty, tw, 22, 11);
      g.fill();
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(text, tx + 8, ty + 11.5);
    }

    function marker(ap: Airport, pop: number, t: number, dep: boolean): void {
      const [x, y, z] = proj(fromLonLat(ap.lon, ap.lat));
      if (z <= 0.02 || pop <= 0) return;
      const ring = ((t / 1700) + (dep ? 0 : 0.5)) % 1;
      g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - ring) * pop})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 4 + ring * 15 * pop, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = dep ? '#fff' : '#ffd9cf';
      g.beginPath();
      g.arc(x, y, 4.6 * pop, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#F37160';
      g.stroke();
      // code label
      g.font = '700 12px system-ui, sans-serif';
      const label = ap.code;
      const lw = g.measureText(label).width + 14;
      const right = x < cx;
      const lx = right ? x + 11 : x - 11 - lw;
      const ly = y - 11;
      g.fillStyle = `rgba(20,6,24,${0.78 * pop})`;
      g.beginPath();
      g.roundRect(lx, ly, lw, 22, 11);
      g.fill();
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(label, lx + 7, ly + 11.5);
    }
  }

  /* ---------- interaction ---------- */

  function nearest(x: number, y: number): (typeof pins)[number] | null {
    let best: (typeof pins)[number] | null = null;
    let bestD = 15 * 15;
    for (const p of pins) {
      if (p.z <= 0.05) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // two fingers on the globe zoom it (instead of the whole page)
  const touches = new Map<number, [number, number]>();
  let pinchDist = 0;
  let pinchZoom = 1;
  const spread = (): number => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  };

  canvas.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, local(e));
    if (touches.size === 2) {
      pinchDist = spread() || 1;
      pinchZoom = zoomTarget;
      dragging = false;
      moved = 99;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    dragging = true;
    moved = 0;
    [lastX, lastY] = local(e);
    spin = 0;
    pinned = null;
    canvas.setPointerCapture(e.pointerId);
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [x, y]);
    if (touches.size >= 2) {
      setZoom(pinchZoom * (spread() / pinchDist));
      return;
    }
    if (dragging) {
      const dx = x - lastX;
      const dy = y - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const R = radius() * cam.scale * zoom;
      cam.lon = wrap(cam.lon - (dx / R) * DEG * 0.9);
      if (e.pointerType !== 'touch') cam.lat = clamp(cam.lat + (dy / R) * DEG * 0.9, -75, 75);
      spin = (-dx / R) * DEG * 0.9 / 16;
      lastX = x;
      lastY = y;
      userUntil = performance.now() + 4000;
    } else {
      hover = nearest(x, y);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
    }
    kick();
  });
  const release = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    if (!dragging) return;
    dragging = false;
    userUntil = performance.now() + 4000;
    if (moved < 5) {
      const [x, y] = local(e);
      const hit = nearest(x, y);
      pinned = hit;
      if (hit) {
        glideTo = { lon: hit.ap.lon, lat: clamp(hit.ap.lat, -50, 50), scale: Math.max(cam.scale, 1.15) };
        glideUntil = performance.now() + 2600;
        userUntil = 0;
        zoomTarget = Math.max(zoomTarget, 1.7);
      }
    }
    kick();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    kick();
  });
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y';

  // trackpad pinch (and ctrl + scroll) zooms the globe, not the page; plain scrolling still scrolls the page
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomTarget * Math.exp(-e.deltaY * 0.01));
    },
    { passive: false },
  );
  // Safari reports a trackpad pinch as gesture events
  let gestureStart = 1;
  canvas.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    gestureStart = zoomTarget;
  });
  canvas.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    setZoom(gestureStart * ((e as unknown as { scale: number }).scale || 1));
  });
  host.querySelector('[data-zoom="in"]')?.addEventListener('click', () => setZoom(zoomTarget * 1.5));
  host.querySelector('[data-zoom="out"]')?.addEventListener('click', () => setZoom(zoomTarget / 1.5));

  /* ---------- starting and stopping ---------- */

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver((entries) => {
    visible = entries.some((en) => en.isIntersecting);
    if (visible) {
      last = 0;
      resize();
      kick();
    }
  }).observe(host);
  resize();

  function replay(): void {
    zoomTarget = 1;
    routeStart = performance.now();
    userUntil = 0;
    glideTo = null;
    pinned = null;
    kick();
  }

  return {
    setRoute(from, to, play = true) {
      const a = from ? airportByCode(from) : undefined;
      const b = to ? airportByCode(to) : undefined;
      if (!a || !b || a.code === b.code) {
        route = null;
        if (note) {
          note.textContent = from && to ? `${from} to ${to} isn't on the map yet.` : 'Drag to spin. Pinch or + / − to zoom. Tap an airport.';
          note.hidden = false;
        }
        canvas.setAttribute('aria-label', 'Globe showing the AirAsia network');
        kick();
        return;
      }
      route = makeRoute(a, b);
      zoomTarget = 1;
      routeStart = play ? performance.now() : performance.now() - (TURN_MS + route.flyMs + SETTLE_MS);
      userUntil = 0;
      glideTo = null;
      pinned = null;
      if (note) note.hidden = true;
      canvas.setAttribute('aria-label', `Globe showing the route from ${a.city} to ${b.city}`);
      kick();
    },
    replay,
  };
}
