// node compare.cjs <beforeDir> <afterDir> — the acceptance numbers that failed, before and after the fixes,
// per screen and house: walk-up (fastest camera step after the opening flight, longest stop, framings
// without a composition report), Property composed, technician under UI cards (layout overlap of the
// camera bar), automatic movement after player input, and closest zoom to the technician.
const fs = require('fs');
const path = require('path');
const [beforeDir, afterDir] = process.argv.slice(2);
const load = (dir, prof, lot) => {
  const f = path.join(dir, prof, `${lot}-metrics.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
function walk(m) {
  const w = m.walkup;
  const first = w.reframes[0]?.t ?? 0;
  const arrived = w.reframes.find((f) => f.reason === 'arrived')?.t ?? Infinity;
  const steps = [];
  for (let i = 1; i < w.cam.length; i++) {
    const [t0, ...a] = w.cam[i - 1];
    const [t1, ...b] = w.cam[i];
    if (t1 < first + 1350 || t1 > arrived - 300) continue;
    steps.push({ t: t1, v: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / ((t1 - t0) / 1000) });
  }
  let still = 0;
  let longest = 0;
  let prevT = null;
  for (const s of steps) {
    if (s.v < 0.05) still += prevT === null ? 0 : s.t - prevT;
    else still = 0;
    longest = Math.max(longest, still);
    prevT = s.t;
  }
  const walking = m.reframes.filter((f) => f.t <= (m.reframes.find((x) => x.reason === 'arrived')?.t ?? Infinity) && f.reason !== 'arrived');
  return { peak: steps.length ? Math.max(...steps.map((s) => s.v)) : 0, longestStop: longest / 1000, uncomposed: walking.filter((f) => f.fill === null).length, reaims: walking.filter((f) => f.reason === 'follow').length };
}
const overlap = (a, b) => a && b && Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 1 && Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 1;
const rows = [];
for (const prof of ['desktop', 'laptop', 'portrait', 'landscape']) {
  for (const lot of ['c-n-4', 'n-o-1', 'a-s-2', 'a-s-1']) {
    const out = [];
    for (const [label, dir] of [['before', beforeDir], ['after', afterDir]]) {
      const m = load(dir, prof, lot);
      if (!m) { out.push(`${label}: missing`); continue; }
      const w = walk(m);
      const ui = m.shots.work.ui;
      const barHit = ['actionBar', 'worldControls', 'toasts'].filter((k) => overlap(ui.serviceBar, ui[k]));
      const drift = Object.values(m.controls).map((c) => c.driftAfter10s);
      const closest = Math.min(...Object.values(m.controls).map((c) => c.released.dist));
      const prop = m.shots.property.serviceView;
      out.push(`${label}: walk peak ${w.peak.toFixed(1)} m/s, longest stop ${w.longestStop.toFixed(1)} s, uncomposed ${w.uncomposed}, re-aims ${w.reaims} | property ${prop.report ? 'composed' : 'FALLBACK'} | bar overlaps ${barHit.join('+') || 'none'} | self-moves >0.3 m ${drift.filter((d) => d > 0.3).length}/4 (max ${Math.max(...drift).toFixed(2)}) | closest zoom ${closest.toFixed(2)} m | errors ${m.errors.length}`);
    }
    rows.push(`${prof} ${lot}\n  ${out.join('\n  ')}`);
  }
}
const text = rows.join('\n');
console.log(text);
if (process.argv[4]) fs.writeFileSync(process.argv[4], text);
