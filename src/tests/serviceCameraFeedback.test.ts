import { beforeEach, describe, expect, it } from 'vitest';
import { SERVICE_OFF_TITLE, useApp, withServiceOffNotice, type Toast } from '@/app/store';

const offNotices = () => useApp.getState().toasts.filter((t) => t.title === SERVICE_OFF_TITLE);
const watch = (mode: 'property' | 'work' | 'detail' = 'work') => useApp.getState().setServiceView({ jobId: 'job-1', lotId: 'lot-a', mode });

describe('service camera off notice', () => {
  beforeEach(() => {
    useApp.getState().newGame(42);
    useApp.setState({ toasts: [], serviceView: null, selection: { kind: 'job', id: 'job-1' } });
  });

  it('adds the notice once, however often it is asked for', () => {
    const once = withServiceOffNotice([]);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ type: 'info', title: SERVICE_OFF_TITLE, body: 'Select Watch technician to return.' });
    expect(withServiceOffNotice(once)).toBe(once);
    const other: Toast = { id: 999, type: 'info', title: 'Saved', createdAt: 0 };
    expect(withServiceOffNotice([other]).map((t) => t.title)).toEqual(['Saved', SERVICE_OFF_TITLE]);
  });

  it('switching shots and leaving with the exit button say nothing', () => {
    for (const mode of ['property', 'work', 'detail', 'property', 'detail', 'work'] as const) watch(mode);
    expect(useApp.getState().serviceView?.mode).toBe('work');
    expect(useApp.getState().serviceView?.rev).toBe(6);
    useApp.getState().setServiceView(null);
    expect(useApp.getState().serviceView).toBeNull();
    expect(offNotices()).toHaveLength(0);
  });

  it('the service camera’s own commands keep it on, quietly', () => {
    watch();
    useApp.getState().camera({ type: 'focus', target: { x: 0, z: 0 }, distance: 6, service: true });
    expect(useApp.getState().serviceView).not.toBeNull();
    expect(offNotices()).toHaveLength(0);
  });

  it('Overview, HQ and other camera commands end it with one notice', () => {
    watch();
    useApp.getState().camera({ type: 'reset' });
    expect(useApp.getState().serviceView).toBeNull();
    expect(offNotices()).toHaveLength(1);
    watch();
    useApp.getState().camera({ type: 'hq' });
    useApp.getState().camera({ type: 'reset' });
    expect(offNotices()).toHaveLength(1);
    // Without the service camera on, camera commands say nothing.
    useApp.setState({ toasts: [] });
    useApp.getState().camera({ type: 'hq' });
    expect(offNotices()).toHaveLength(0);
  });

  it('picking another job or property ends it with a notice; the same job, its house or closing the card keep it', () => {
    watch();
    useApp.getState().select({ kind: 'lot', id: 'lot-a' });
    useApp.getState().select({ kind: 'job', id: 'job-1' });
    useApp.getState().select(null);
    expect(useApp.getState().serviceView).not.toBeNull();
    expect(offNotices()).toHaveLength(0);
    useApp.getState().select({ kind: 'lot', id: 'lot-b' });
    expect(useApp.getState().serviceView).toBeNull();
    expect(offNotices()).toHaveLength(1);
    useApp.getState().select({ kind: 'job', id: 'job-2' });
    expect(offNotices()).toHaveLength(1);
  });

  it('panning away (serviceCameraOff) ends it with a notice, only while it is on', () => {
    useApp.getState().serviceCameraOff();
    expect(offNotices()).toHaveLength(0);
    watch('detail');
    useApp.getState().serviceCameraOff();
    useApp.getState().serviceCameraOff();
    expect(useApp.getState().serviceView).toBeNull();
    expect(offNotices()).toHaveLength(1);
  });

  it('after the notice is dismissed, a later end shows it again', () => {
    watch();
    useApp.getState().camera({ type: 'reset' });
    useApp.getState().dismissToast(offNotices()[0].id);
    watch();
    useApp.getState().serviceCameraOff();
    expect(offNotices()).toHaveLength(1);
  });

  it('a new game or a load clears the service camera without a notice', () => {
    watch();
    useApp.getState().newGame(7);
    expect(useApp.getState().serviceView).toBeNull();
    expect(offNotices()).toHaveLength(0);
  });
});
