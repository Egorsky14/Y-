import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { scaleView, wheelRatio, zoomedCommand, zoomLimits, zoomSubject } from '@/world/scene/serviceZoom';

const WIDE = { min: 1, max: 90 };

describe('service camera zoom', () => {
  it('scales the view about the technician: he stays on the same sight line, on a roof too', () => {
    const subject = new THREE.Vector3(10, 5.3, -4);
    const pos = new THREE.Vector3(16, 9, 2);
    // The director's aim point, on the ground beyond him.
    const target = new THREE.Vector3(10 - 6 * 1.4, 0, -4 - 6 * 1.4);
    const dirBefore = target.clone().sub(pos).normalize();
    const k = scaleView(pos, target, subject, 0.4, WIDE);
    expect(k).toBeCloseTo(0.4, 5);
    expect(target.clone().sub(pos).normalize().distanceTo(dirBefore)).toBeLessThan(1e-9);
    // Above the deck, closer to him, never down toward the ground point.
    expect(pos.y).toBeGreaterThan(subject.y);
  });

  it('zooming out undoes zooming in exactly', () => {
    const subject = new THREE.Vector3(1, 2, 3);
    const pos = new THREE.Vector3(8, 7, 9);
    const target = new THREE.Vector3(-3, 0, -2);
    const p0 = pos.clone();
    const t0 = target.clone();
    scaleView(pos, target, subject, 0.5, WIDE);
    scaleView(pos, target, subject, 2, WIDE);
    expect(pos.distanceTo(p0)).toBeLessThan(1e-9);
    expect(target.distanceTo(t0)).toBeLessThan(1e-9);
  });

  it('stops at the limit for what he is doing', () => {
    const subject = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3(0, 1, 10);
    const target = new THREE.Vector3(0, 0, -10);
    scaleView(pos, target, subject, 0.01, zoomLimits('work', 'roof:climb'));
    expect(pos.distanceTo(subject)).toBeCloseTo(2.2, 5);
  });

  it('has limits that suit the scene', () => {
    expect(zoomLimits('work', 'roof:work').min).toBe(1);
    expect(zoomLimits('work', 'work').min).toBe(1);
    expect(zoomLimits('work', 'walk').min).toBe(1.5);
    expect(zoomLimits('work', 'roof:climb').min).toBe(2.2);
    expect(zoomLimits('property', 'work').max).toBeGreaterThan(zoomLimits('work', 'work').max);
  });

  it('leaves the director\'s shot alone at the default zoom, and carries the zoom onto it otherwise', () => {
    const cmd = { type: 'focus' as const, target: { x: 0, z: 0 }, targetY: 0, azimuth: 0.4, elevation: 0.5, distance: 20, orbit: true, service: true };
    const subject = zoomSubject({ x: 2, y: 4, z: 2 }, 'roof:work');
    expect(zoomedCommand(cmd, subject, 1, WIDE)).toBe(cmd);
    const closer = zoomedCommand(cmd, subject, 0.5, WIDE);
    expect(closer.distance).toBeCloseTo(10, 5);
    // The aim point has moved toward him, off the ground.
    expect(closer.targetY).toBeGreaterThan(0);
    expect(closer.azimuth).toBe(cmd.azimuth);
    expect(closer.elevation).toBe(cmd.elevation);
  });

  it('goes by how far the wheel scrolled, so a trackpad does not race', () => {
    const notch = wheelRatio({ deltaY: 120, deltaMode: 0, ctrlKey: false });
    const swipe = wheelRatio({ deltaY: 4, deltaMode: 0, ctrlKey: false });
    expect(notch).toBeGreaterThan(1.1);
    expect(swipe).toBeLessThan(1.01);
    expect(wheelRatio({ deltaY: -120, deltaMode: 0, ctrlKey: false })).toBeLessThan(1);
    // Line and page modes, and a trackpad pinch (ctrl held, small steps).
    expect(wheelRatio({ deltaY: 3, deltaMode: 1, ctrlKey: false })).toBeGreaterThan(1.03);
    expect(wheelRatio({ deltaY: 6, deltaMode: 0, ctrlKey: true })).toBeGreaterThan(1.04);
  });
});
