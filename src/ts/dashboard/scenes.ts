/**
 * Small original illustrations for the trip ideas: a skyline or landmark of each place, drawn in SVG, in one of four
 * moods (sunrise, day, dusk, night). They are drawn here, not photos, so there is nothing to download and nothing
 * to license. Real photos from the airline could replace them later.
 */

interface Mood {
  sky: [string, string];
  sun: string;
  sil: string;
  far: string;
  accent: string;
  stars: boolean;
  moon: boolean;
}

const MOODS: Mood[] = [
  { sky: ['#ffd9a8', '#ff8fa3'], sun: '#fff1c2', sil: '#5a1d4c', far: '#b24a74', accent: '#ffe2a8', stars: false, moon: false },
  { sky: ['#7fd0f2', '#e6f8ff'], sun: '#ffffff', sil: '#1d5a69', far: '#78bccb', accent: '#ffffff', stars: false, moon: false },
  { sky: ['#5e3f8f', '#ff8a3d'], sun: '#ffd37a', sil: '#2a1745', far: '#7d4a80', accent: '#ffc46b', stars: false, moon: false },
  { sky: ['#0a1b3b', '#53307a'], sun: '#f6f1d1', sil: '#080d22', far: '#2b2e5c', accent: '#ffd978', stars: true, moon: true },
];

const GROUND = 168;
let uid = 0;

type Draw = (m: Mood) => string;

/** A building: x, width, height standing on the ground, with a few lit windows. */
const bld = (x: number, w: number, h: number, m: Mood, win = true): string => {
  let s = `<rect x="${x}" y="${GROUND - h}" width="${w}" height="${h}"/>`;
  if (win && w >= 12) {
    for (let r = 0; r < Math.floor((h - 8) / 12); r++) {
      for (let c = 0; c < Math.floor((w - 4) / 6); c++) {
        if ((r * 7 + c * 3 + x) % 4 === 0) s += `<rect x="${x + 3 + c * 6}" y="${GROUND - h + 6 + r * 12}" width="3" height="4" fill="${m.accent}" opacity=".55"/>`;
      }
    }
  }
  return s;
};

const palm = (x: number, h: number, lean = 1): string => {
  const top = `${x + lean * 8},${GROUND - h}`;
  let s = `<path d="M${x} ${GROUND} Q${x + lean * 2} ${GROUND - h / 2} ${top}" stroke-width="3" fill="none"/>`;
  for (const [dx, dy] of [[-22, 6], [-14, -6], [0, -10], [14, -6], [22, 6]]) {
    s += `<path d="M${top} Q${x + lean * 8 + dx * 0.6},${GROUND - h + dy - 10} ${x + lean * 8 + dx},${GROUND - h + dy + 6}" stroke-width="2.6" fill="none"/>`;
  }
  return s;
};

const waves = (m: Mood): string =>
  `<g fill="none" stroke="${m.accent}" stroke-width="1.4" opacity=".35"><path d="M0 178 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/><path d="M-10 188 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/></g>`;

const SCENES: Record<string, Draw> = {
  hongkong: (m) => {
    const hills = `<path d="M0 ${GROUND} L0 120 Q55 78 118 128 Q168 92 238 138 L320 112 L320 ${GROUND}Z" fill="${m.far}"/>`;
    const b = [[18, 18, 52], [40, 14, 72], [58, 20, 46], [82, 16, 92], [102, 22, 62], [128, 15, 112], [147, 20, 76], [171, 16, 56], [191, 24, 96], [219, 16, 66], [239, 22, 86], [265, 14, 50], [283, 26, 70]];
    return `${hills}<g fill="${m.sil}">${b.map(([x, w, h]) => bld(x!, w!, h!, m)).join('')}<path d="M135.5 56 V40" stroke="${m.sil}" stroke-width="2"/></g>`;
  },
  kualalumpur: (m) => {
    const tower = (cx: number): string => `<path d="M${cx - 11} ${GROUND} V74 L${cx - 7} 58 L${cx - 4} 44 L${cx} 20 L${cx + 4} 44 L${cx + 7} 58 L${cx + 11} 74 V${GROUND}Z"/>`;
    const lines = `<g stroke="${m.accent}" stroke-width=".8" opacity=".4"><path d="M114 90H146M114 112H146M114 134H146M174 90H206M174 112H206M174 134H206"/></g>`;
    const bg = [[20, 18, 40], [44, 14, 56], [66, 20, 34], [250, 16, 50], [272, 18, 36], [294, 20, 58]];
    return `<g fill="${m.far}">${bg.map(([x, w, h]) => bld(x!, w!, h!, m, false)).join('')}</g><g fill="${m.sil}">${tower(125)}${tower(185)}<rect x="136" y="104" width="38" height="6"/><rect x="236" y="60" width="4" height="108"/><ellipse cx="238" cy="78" rx="10" ry="7"/><path d="M238 70V36" stroke="${m.sil}" stroke-width="2"/></g>${lines}`;
  },
  kolkata: (m) => {
    let truss = '';
    for (let x = 62; x <= 258; x += 14) {
      const t = x < 160 ? (x - 62) / 98 : (258 - x) / 98;
      const top = 124 - t * 44;
      truss += `<path d="M${x} 142V${top}"/>`;
    }
    return `${waves(m)}<g stroke="${m.sil}" fill="none" stroke-linecap="round"><path d="M62 124L100 82L160 104L220 82L258 124" stroke-width="5"/><path d="M40 142H280" stroke-width="6"/><g stroke-width="2">${truss}</g><path d="M100 82V168M220 82V168" stroke-width="7"/></g><g fill="${m.sil}"><path d="M286 ${GROUND}V130H312V${GROUND}Z"/><path d="M286 130a13 13 0 0 1 26 0Z"/></g>`;
  },
  delhi: (m) => {
    const gate = `<path fill-rule="evenodd" d="M118 ${GROUND}V92H202V${GROUND}H178V134a18 18 0 0 0 -36 0V${GROUND}Z"/><rect x="112" y="84" width="96" height="8"/>`;
    const dome = `<rect x="36" y="130" width="56" height="${GROUND - 130}"/><path d="M42 130a22 22 0 0 1 44 0Z"/><path d="M64 108V98" stroke="${m.sil}" stroke-width="2"/>`;
    let wall = `<rect x="232" y="138" width="78" height="${GROUND - 138}"/>`;
    for (let x = 232; x < 308; x += 12) wall += `<rect x="${x}" y="130" width="7" height="8"/>`;
    return `<g fill="${m.far}"><circle cx="276" cy="124" r="14"/></g><g fill="${m.sil}">${gate}${dome}${wall}</g>`;
  },
  mumbai: (m) => {
    const arch = `<path fill-rule="evenodd" d="M122 ${GROUND}V100H198V${GROUND}H176V136a16 16 0 0 0 -32 0V${GROUND}Z"/>`;
    const turret = (x: number): string => `<rect x="${x}" y="84" width="12" height="${GROUND - 84}"/><path d="M${x} 84a6 6 0 0 1 12 0Z"/>`;
    const taj = `<rect x="40" y="106" width="46" height="${GROUND - 106}"/><path d="M46 106a17 17 0 0 1 34 0Z"/><rect x="62" y="82" width="2" height="10"/>`;
    const boat = `<path d="M240 168h42l-6 8h-30Z"/><path d="M262 168V138l16 28Z"/>`;
    return `<g fill="${m.sil}">${taj}${arch}${turret(114)}${turret(194)}${boat}</g>${waves(m)}`;
  },
  bengaluru: (m) => {
    let cols = '';
    for (let x = 96; x <= 218; x += 11) cols += `<rect x="${x}" y="124" width="5" height="${GROUND - 124}"/>`;
    const tree = (x: number, r: number): string => `<rect x="${x - 2}" y="${GROUND - r - 12}" width="4" height="${r + 12}"/><circle cx="${x}" cy="${GROUND - r - 14}" r="${r}"/>`;
    return `<g fill="${m.far}"><rect x="262" y="70" width="30" height="${GROUND - 70}"/><rect x="296" y="104" width="18" height="${GROUND - 104}"/></g><g fill="${m.sil}"><rect x="84" y="112" width="152" height="12"/>${cols}<rect x="84" y="${GROUND - 4}" width="152" height="4"/><path d="M134 112a26 26 0 0 1 52 0Z"/><rect x="159" y="72" width="2" height="16"/>${tree(58, 18)}${tree(30, 14)}${tree(262, 15)}</g>`;
  },
  bangkok: (m) => {
    const prang = (cx: number, s: number): string => {
      const p = (dx: number, y: number): string => `${cx + dx * s},${GROUND - y * s}`;
      return `<polygon points="${p(-24, 0)} ${p(-24, 36)} ${p(-16, 36)} ${p(-16, 62)} ${p(-9, 62)} ${p(-9, 84)} ${p(-4, 84)} ${p(0, 128)} ${p(4, 84)} ${p(9, 84)} ${p(9, 62)} ${p(16, 62)} ${p(16, 36)} ${p(24, 36)} ${p(24, 0)}"/>`;
    };
    return `<g fill="${m.far}">${prang(70, 0.55)}${prang(250, 0.55)}</g><g fill="${m.sil}">${prang(160, 1)}<rect x="110" y="${GROUND - 14}" width="100" height="14"/></g>${waves(m)}`;
  },
  singapore: (m) => {
    let trees = '';
    for (const [x, h] of [[240, 70], [268, 90], [296, 60]] as const) {
      trees += `<rect x="${x - 3}" y="${GROUND - h}" width="6" height="${h}"/><path d="M${x - 22} ${GROUND - h - 6}Q${x} ${GROUND - h - 34} ${x + 22} ${GROUND - h - 6}Q${x} ${GROUND - h + 4} ${x - 22} ${GROUND - h - 6}Z"/>`;
    }
    const lights = `<g stroke="${m.accent}" stroke-width="1" opacity=".5"><path d="M236 ${GROUND - 80}V${GROUND - 8}M268 ${GROUND - 100}V${GROUND - 8}M296 ${GROUND - 70}V${GROUND - 8}"/></g>`;
    return `<g fill="${m.far}">${bld(16, 20, 44, m, false)}${bld(40, 16, 62, m, false)}${bld(60, 22, 36, m, false)}</g><g fill="${m.sil}"><rect x="100" y="80" width="24" height="${GROUND - 80}"/><rect x="132" y="80" width="24" height="${GROUND - 80}"/><rect x="164" y="80" width="24" height="${GROUND - 80}"/><path d="M92 74H208L222 68H196L92 70Z"/><rect x="90" y="72" width="120" height="8" rx="4"/>${trees}</g>${lights}${waves(m)}`;
  },
  bali: (m) => {
    const terr = `<path d="M0 ${GROUND}V134Q80 112 160 130T320 120V${GROUND}Z" fill="${m.far}"/><path d="M0 ${GROUND}V150Q90 132 170 146T320 140V${GROUND}Z" fill="${m.far}" opacity=".7"/>`;
    const half = (outer: number, inner: number): string => {
      const dir = inner > outer ? 1 : -1;
      let s = `M${outer} ${GROUND}`;
      const steps = [[0, 96], [10, 96], [10, 82], [20, 82], [20, 66], [30, 66], [30, 50], [40, 50]];
      for (const [dx, y] of steps) s += ` L${outer + dir * dx} ${y}`;
      s += ` L${inner} 38 V${GROUND}Z`;
      return `<path d="${s}"/>`;
    };
    return `${terr}<g fill="${m.sil}" stroke="${m.sil}">${half(94, 146)}${half(226, 174)}${palm(52, 80, -1)}${palm(274, 90, 1)}</g>`;
  },
  hochiminh: (m) => {
    const spire = (x: number): string => `<rect x="${x}" y="100" width="16" height="${GROUND - 100}"/><path d="M${x - 1} 100L${x + 8} 52L${x + 17} 100Z"/>`;
    return `<g fill="${m.far}">${bld(20, 20, 44, m, false)}${bld(44, 14, 62, m, false)}${bld(260, 18, 56, m, false)}${bld(284, 24, 40, m, false)}</g><g fill="${m.sil}">${spire(80)}${spire(124)}<rect x="96" y="118" width="28" height="${GROUND - 118}"/><rect x="76" y="${GROUND - 8}" width="68" height="8"/><rect x="200" y="74" width="32" height="${GROUND - 74}"/><path d="M200 74H232L226 50L208 54Z"/><rect x="232" y="94" width="16" height="6"/></g><circle cx="110" cy="132" r="5" fill="${m.accent}" opacity=".7"/>`;
  },
  manila: (m) => {
    const tower = (x: number): string => `<rect x="${x}" y="96" width="22" height="${GROUND - 96}"/><path d="M${x} 96a11 11 0 0 1 22 0Z"/><rect x="${x + 10}" y="76" width="2" height="10"/>`;
    return `<g fill="${m.sil}"><rect x="108" y="116" width="104" height="${GROUND - 116}"/><path d="M130 116L160 90L190 116Z"/>${tower(100)}${tower(198)}<g fill="${m.accent}" opacity=".5"><rect x="148" y="132" width="24" height="36" rx="12"/></g>${palm(46, 96, 1)}${palm(278, 84, -1)}</g>${waves(m)}`;
  },
  tokyo: (m) => {
    const fuji = `<polygon fill="${m.far}" points="6,${GROUND} 112,86 132,86 238,${GROUND}"/><polygon fill="${m.sun}" opacity=".92" points="112,86 132,86 140,98 130,94 122,102 114,94 104,98"/>`;
    const tower = `<g fill="none" stroke="${m.sil}" stroke-width="3"><path d="M236 ${GROUND}L250 40L264 ${GROUND}"/><path d="M241 ${GROUND - 70}H259M244 ${GROUND - 36}H256"/><path d="M250 40V22" stroke-width="2"/></g><rect x="241" y="96" width="18" height="6" fill="${m.sil}"/><rect x="246" y="70" width="8" height="5" fill="${m.sil}"/>`;
    return `${fuji}<g fill="${m.sil}">${bld(10, 20, 40, m)}${bld(34, 16, 58, m)}${bld(54, 22, 34, m)}${bld(284, 16, 46, m)}${bld(302, 18, 60, m)}</g>${tower}`;
  },
  sydney: (m) => {
    const sail = (x: number, w: number, h: number): string => `<path d="M${x} ${GROUND}Q${x + w * 0.05} ${GROUND - h} ${x + w * 0.95} ${GROUND - h * 0.5}L${x + w} ${GROUND}Z"/>`;
    return `<g fill="none" stroke="${m.far}" stroke-width="5"><path d="M180 ${GROUND}Q256 60 332 ${GROUND}"/><path d="M180 150H332"/></g><g fill="${m.sil}" stroke="${m.accent}" stroke-width="1.2" stroke-opacity=".55" stroke-linejoin="round">${sail(70, 50, 78)}${sail(104, 44, 64)}${sail(134, 38, 50)}${sail(60, 26, 44)}</g><rect x="56" y="${GROUND - 6}" width="124" height="6" fill="${m.sil}"/>${waves(m)}`;
  },
};

/** An illustration for a place in the given mood (0 sunrise, 1 day, 2 dusk, 3 night). */
export function sceneSVG(place: string, mood: number, label: string, align = 'xMidYMax'): string {
  const m = MOODS[((mood % 4) + 4) % 4] ?? MOODS[0]!;
  const draw = SCENES[place];
  const id = `sc${++uid}`;
  let stars = '';
  if (m.stars) for (let i = 0; i < 22; i++) stars += `<circle cx="${(i * 53) % 320}" cy="${(i * 37) % 90 + 6}" r="${i % 3 === 0 ? 1.4 : 0.9}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}"/>`;
  const sun = m.moon
    ? `<circle cx="252" cy="52" r="15" fill="${m.sun}"/>`
    : `<circle cx="238" cy="70" r="26" fill="${m.sun}" opacity=".95"/>`;
  return `<svg class="scene" viewBox="0 0 320 200" preserveAspectRatio="${align} slice" role="img" aria-label="${label.replace(/"/g, '&quot;')}" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.sky[0]}"/><stop offset="1" stop-color="${m.sky[1]}"/></linearGradient></defs><rect width="320" height="200" fill="url(#${id})"/>${stars}${sun}${draw ? draw(m) : ''}<rect x="0" y="${GROUND}" width="320" height="32" fill="${m.sil}"/></svg>`;
}
