import type { Quality } from './store';

/**
 * What the game knows about the device at start-up. Phones and tablets are told apart from
 * desktops by a coarse primary pointer plus screen size, not by user-agent sniffing.
 */
export interface DeviceProfile {
  /** Primary input is touch (no fine pointer such as a mouse). */
  touch: boolean;
  /** Small screen: the shorter side is under 600 CSS px (phones in either orientation). */
  phone: boolean;
  /** Touch device with a larger screen (tablets). */
  tablet: boolean;
  /** Few cores or little memory: start on the lightest preset. */
  lowEnd: boolean;
  webgl2: boolean;
}

let cached: DeviceProfile | null = null;

export function deviceProfile(): DeviceProfile {
  if (cached) return cached;
  if (typeof window === 'undefined') return { touch: false, phone: false, tablet: false, lowEnd: false, webgl2: true };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const fine = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  const touch = coarse && !fine ? true : coarse && navigator.maxTouchPoints > 0 && !window.matchMedia?.('(hover: hover)').matches;
  const shortSide = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
  const phone = touch && shortSide < 600;
  const tablet = touch && !phone;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 8;
  const lowEnd = (memory !== undefined && memory <= 3) || cores <= 4;
  cached = { touch, phone, tablet, lowEnd, webgl2: hasWebGL2() };
  return cached;
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * First-run graphics preset. Desktops keep High. Phones start Balanced (medium: 2k shadows,
 * up to 1.25x pixel ratio), low-end phones Battery Saver (low: no shadows, 1x pixel ratio, no
 * MSAA); tablets start Balanced. The adaptive check in the game can step down once if needed.
 */
export function defaultQuality(p: DeviceProfile = deviceProfile()): Quality {
  if (p.phone) return p.lowEnd ? 'low' : 'medium';
  if (p.tablet) return 'medium';
  return 'high';
}

/** Player-facing names on touch devices; desktop keeps Low / Medium / High / Ultra. */
export const MOBILE_PRESETS: { quality: Quality; label: string; detail: string }[] = [
  { quality: 'low', label: 'Battery Saver', detail: 'No shadows, 1x resolution, no anti-aliasing, sparse desert' },
  { quality: 'medium', label: 'Balanced', detail: 'Soft shadows, up to 1.25x resolution' },
  { quality: 'high', label: 'High', detail: 'Sharp shadows, up to 1.5x resolution, full vegetation' },
];

export function presetLabel(q: Quality, touch = deviceProfile().touch): string {
  if (!touch) return q.charAt(0).toUpperCase() + q.slice(1);
  return MOBILE_PRESETS.find((p) => p.quality === q)?.label ?? 'Ultra';
}
