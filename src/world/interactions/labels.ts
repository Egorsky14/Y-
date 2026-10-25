import type * as THREE from 'three';

/**
 * World-anchored DOM labels without nested React roots. UI components register a DOM
 * element plus a function that writes the anchor's world position; the LabelProjector
 * (inside the Canvas) projects each anchor every frame and positions the element.
 */
export interface LabelAnchor {
  el: HTMLElement;
  getPosition: (out: THREE.Vector3) => boolean;
  /** Reference distance for scaling (labels shrink when the camera is farther than this). */
  referenceDistance: number;
}

const registry = new Map<string, LabelAnchor>();

export function registerLabel(id: string, anchor: LabelAnchor | null): void {
  if (anchor) registry.set(id, anchor);
  else registry.delete(id);
}

export function labelAnchors(): IterableIterator<[string, LabelAnchor]> {
  return registry.entries();
}
