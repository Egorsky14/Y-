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
  // The top HUD bar only matters with the panel open (the close-up and selected-job views).
  if (!panel) return none;
  let top = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.top-hud > *')) {
    const r = visibleRect(el);
    if (r) top = Math.max(top, (r.bottom - c.top) / c.height);
  }
  top = Math.min(0.2, top);
  // A sheet spanning most of the width covers the bottom; otherwise it is a side panel.
  if (panel.width > c.width * 0.7) return { right: 0, bottom: clamp01((c.bottom - panel.top) / c.height), top };
  return { right: clamp01((c.right - panel.left) / c.width), bottom: 0, top };
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
