import type { SafeArea } from '@/world/scene/cameraOcclusion';

/**
 * How much of the 3D view the open inspector covers, as fractions of the canvas: a side panel
 * covers part of the width (desktop, landscape phones), the bottom sheet part of the height
 * (upright phones). The camera centres the scene in what is left (CameraRig view offset), and
 * close-ups frame their subject inside it (serviceCloseUpCamera).
 */
export function measureSafeArea(canvas: HTMLElement | null): SafeArea {
  const none = { right: 0, bottom: 0, top: 0 };
  if (!canvas) return none;
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return none;
  const panel = visibleRect(document.querySelector<HTMLElement>('.inspector'));
  // The service camera bar sits under the HUD on phones (on desktop it is a small strip at the bottom centre).
  const bar = visibleRect(document.querySelector<HTMLElement>('.service-bar'));
  const barTop = bar && bar.top - c.top < c.height / 2 ? bar : null;
  // The top HUD bar only matters with the panel or the camera bar up (the close-up and selected-job views).
  if (!panel && !barTop) return none;
  let top = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.top-hud > *')) {
    const r = visibleRect(el);
    if (r) top = Math.max(top, (r.bottom - c.top) / c.height);
  }
  if (barTop) top = Math.max(top, (barTop.bottom - c.top) / c.height);
  top = Math.min(0.2, top);
  // The bottom bars (action bar, world controls, a bottom camera bar) cover a strip along the bottom.
  let bottom = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.action-bar, .world-controls, .service-bar')) {
    const r = visibleRect(el);
    if (r && r.top - c.top > c.height / 2) bottom = Math.max(bottom, (c.bottom - r.top) / c.height);
  }
  bottom = Math.min(0.2, bottom);
  // The camera bar under the HUD (phones) and a collapsed inspector card are small: rather than give up a whole
  // band of the screen, the shot keeps its subject out from under them.
  const avoid: [number, number, number, number][] = [];
  const rect = (r: DOMRect): [number, number, number, number] => [(r.left - c.left) / c.width, (r.top - c.top) / c.height, (r.right - c.left) / c.width, (r.bottom - c.top) / c.height];
  if (barTop) avoid.push(rect(barTop));
  if (!panel) return { right: 0, bottom, top, avoid };
  // A sheet spanning most of the width covers the bottom; otherwise it is a side panel.
  if (panel.width > c.width * 0.7) return { right: 0, bottom: clamp01(Math.max(bottom, (c.bottom - panel.top) / c.height)), top, avoid };
  // A side panel collapsed to its header only takes the top corner: the full width stays free and the subject keeps
  // out from under the card. On short landscape screens the card reaches deep into the view (a quarter of its height
  // or more below the HUD): there its width counts as covered, and the shot is centred in the part beside it.
  if (panel.height < c.height * 0.3) {
    if ((panel.bottom - c.top) / c.height - top > 0.15) return { right: clamp01((c.right - panel.left) / c.width), bottom, top, avoid };
    return { right: 0, bottom, top, avoid: [...avoid, rect(panel)] };
  }
  return { right: clamp01((c.right - panel.left) / c.width), bottom, top, avoid };
}

/** The element's box when it is actually drawn (not display:none or visibility:hidden), else null. */
function visibleRect(el: HTMLElement | null): DOMRect | null {
  if (!el || el.offsetParent === null || getComputedStyle(el).visibility === 'hidden') return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

const clamp01 = (v: number) => Math.min(0.6, Math.max(0, v));

/** The game's 3D canvas (the largest on the page; the fleet preview has its own small one). */
export function mainCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  for (const c of document.querySelectorAll('canvas')) if (!best || c.clientWidth * c.clientHeight > best.clientWidth * best.clientHeight) best = c;
  return best;
}
