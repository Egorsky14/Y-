import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { Icon } from '../components/common';

const WEATHERS = [
  ['', 'Live weather'],
  ['clear', 'Clear'],
  ['heat-wave', 'Heat haze'],
  ['overcast', 'Overcast'],
  ['monsoon', 'Monsoon'],
] as const;

function hhmm(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.round(minute % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Photo mode: hides the HUD, frees the camera, previews any time of day or weather and saves a
 * PNG of the canvas. It only touches presentation state; the simulation keeps running as it was.
 */
export function PhotoMode() {
  const photo = useApp((s) => s.photo);
  const setPhoto = useApp((s) => s.setPhoto);
  const camera = useApp((s) => s.camera);
  const [showBar, setShowBar] = useState(true);
  useEffect(() => {
    if (!photo.on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhoto({ on: false });
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowBar((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo.on, setPhoto]);
  if (!photo.on) return null;
  const capture = () => {
    const canvas = document.querySelector('.app-world canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ego-hvac-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };
  const minute = photo.minute ?? 10 * 60;
  return (
    <div className="photo-mode" data-testid="photo-mode">
      {showBar && (
        <div className="glass photo-bar">
          <div className="photo-group">
            <span className="label">Time</span>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={photo.minute !== null} onChange={(e) => setPhoto({ minute: e.target.checked ? minute : null })} /> Preview
            </label>
            <input type="range" min={5 * 60} max={23 * 60} step={5} value={minute} disabled={photo.minute === null} onChange={(e) => setPhoto({ minute: Number(e.target.value) })} />
            <span className="mono value">{photo.minute === null ? 'Live' : hhmm(minute)}</span>
          </div>
          <div className="photo-group">
            <span className="label">Weather</span>
            <select value={photo.weather ?? ''} onChange={(e) => setPhoto({ weather: (e.target.value || null) as typeof photo.weather })}>
              {WEATHERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="photo-group">
            <button className="btn small" onClick={() => camera({ type: 'reset' })}>
              <Icon name="camera" /> Reset
            </button>
            <button className="btn small" onClick={() => camera({ type: 'hq' })}>
              <Icon name="home" /> HQ
            </button>
            <button className="btn small primary" onClick={capture} data-testid="photo-capture">
              <Icon name="save" /> Save PNG
            </button>
            <button className="btn small ghost" onClick={() => setPhoto({ on: false })} data-testid="photo-exit">
              <Icon name="close" /> Exit
            </button>
          </div>
          <div className="photo-hint muted">Drag to orbit · Right-drag to pan · Wheel to zoom · Tab hides this bar · Esc exits</div>
        </div>
      )}
    </div>
  );
}
