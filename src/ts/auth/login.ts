import '../shared/theme';
import { ApiError, api, brandFolder } from '../shared/api';
import { $ } from '../shared/dom';
import { isEmail, showFieldState, wireLiveValidation, wirePasswordToggles } from '../shared/forms';
import { KEYS, store } from '../shared/storage';

type FieldKey = 'email' | 'pw';

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** After a good login: a plane flies in from the bottom-left corner, leaves a trail, and the welcome appears. */
function welcome(first: string): void {
  const fly = $('#fly');
  const sky = document.querySelector<SVGSVGElement>('#flySky');
  const trail = document.querySelector<SVGPathElement>('#flyTrail');
  const plane = document.querySelector<SVGSVGElement>('#flyPlane');
  const go = (): void => location.assign('dashboard.html');
  $('#flyHello').textContent = first ? `Welcome back, ${first}` : 'Welcome back';
  fly.hidden = false;
  fly.addEventListener('click', go, { once: true });
  requestAnimationFrame(() => fly.classList.add('go'));
  if (!sky || !trail || !plane || reduced()) {
    window.setTimeout(go, reduced() ? 1400 : 900);
    return;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  sky.setAttribute('viewBox', `0 0 ${w} ${h}`);
  trail.setAttribute('d', `M ${-70} ${h + 50} C ${w * 0.3} ${h * 0.92}, ${w * 0.5} ${h * 0.02}, ${w + 110} ${h * 0.1}`);
  const total = trail.getTotalLength();
  const DURATION = 2600;
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // Sample the path once, then let the browser play it: transform animations run on the graphics card, so they stay smooth
  const planeFrames: Keyframe[] = [];
  const trailFrames: Keyframe[] = [];
  const STEPS = 120;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const at = ease(t) * total;
    const a = trail.getPointAtLength(at);
    const b = trail.getPointAtLength(Math.min(total, at + 2));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    planeFrames.push({ offset: t, opacity: 1, transform: `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) rotate(${angle.toFixed(2)}deg)` });
    if (i % 3 === 0 || i === STEPS) trailFrames.push({ offset: t, strokeDasharray: `${ease(t).toFixed(4)} 1` });
  }
  plane.animate(planeFrames, { duration: DURATION, easing: 'linear', fill: 'forwards' }).finished.then(() => { plane.style.opacity = '0'; }).catch(() => undefined);
  trail.animate(trailFrames, { duration: DURATION, easing: 'linear', fill: 'forwards' }).finished
    .then(() => { trail.style.opacity = '0'; }) // the trail fades once the plane has left, so the text stays clear
    .catch(() => undefined);
  window.setTimeout(go, DURATION + 700);
}

function main(): void {
  const form = $<HTMLFormElement>('#form');
  const input = (id: string) => $<HTMLInputElement>(`#${id}`);
  const banner = $('#banner');

  wirePasswordToggles();

  // "Remember me" keeps the email address only, never the password.
  const savedEmail = store.getText(KEYS.rememberedEmail);
  if (savedEmail) {
    input('email').value = savedEmail;
    input('remember').checked = true;
  }

  const rules: Record<FieldKey, () => boolean> = {
    email: () => isEmail(input('email').value),
    pw: () => input('pw').value.length > 0,
  };
  const keys = Object.keys(rules) as FieldKey[];
  const check = (key: FieldKey): boolean => showFieldState(key, rules[key]());

  for (const key of keys) {
    const el = input(key);
    wireLiveValidation(el, key, rules[key]);
    el.addEventListener('input', () => banner.classList.remove('show'));
  }

  $('#resend').addEventListener('click', (event) => {
    event.preventDefault();
    const link = $('#resend');
    api('POST', '/api/verify/resend', { email: input('email').value.trim(), brand: brandFolder() })
      .then(() => {
        link.textContent = 'Sent. Check your inbox';
      })
      .catch(() => {
        link.textContent = 'Could not send. Try again later';
      });
  });

  let busy = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const allValid = keys.map(check).every(Boolean);
    if (!allValid) {
      document.querySelector<HTMLElement>('.field.error input')?.focus();
      return;
    }
    const email = input('email').value.trim();
    if (input('remember').checked) store.setText(KEYS.rememberedEmail, email);
    else store.del(KEYS.rememberedEmail);

    busy = true;
    api<{ first?: string }>('POST', '/api/login', { email, password: input('pw').value, remember: input('remember').checked })
      .then((res) => welcome(res?.first ?? ''))
      .catch((error: unknown) => {
        banner.textContent = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
        banner.classList.add('show');
        $('#resendRow').hidden = !(error instanceof ApiError && error.code === 'email_not_verified');
      })
      .finally(() => {
        busy = false;
      });
  });
}

main();
