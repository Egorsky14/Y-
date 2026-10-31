// node summary.cjs [dir] — one table per acceptance metric across every <profile>/<lot>-metrics.json.
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const rows = [];
for (const prof of ['desktop', 'laptop', 'portrait', 'landscape']) {
  const dir = path.join(root, prof);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('-metrics.json'))) rows.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
const f2 = (v) => (v == null ? '-' : typeof v === 'number' ? +v.toFixed(2) : v);
const out = [];
const p = (s) => out.push(s);
p('SHOTS: requested/shown mode, reason, fill, foreground, roof, plant, distance to tech, elevation, inspector compact' + (rows.some((r) => r.profileBuild) ? ', mask tech visible/height/underUi, kit visible' : ''));
for (const r of rows) {
  p(`\n${r.profile} ${r.lot} (${r.size}) errors=${r.errors.length} failed=${r.failed.length} repair=${r.repairStatus} viewAfterRepair=${r.repairViewMode}`);
  for (const [name, s] of Object.entries(r.shots)) {
    const rep = s.serviceView?.report ?? {};
    const m = s.mask;
    p(`  ${name.padEnd(22)} ${String(s.serviceView?.requested) + '/' + String(s.serviceView?.mode)} ${String(s.serviceView?.reason).padEnd(8)} fill=${f2(rep.fill)} fg=${f2(rep.foreground)} roof=${f2(rep.roof)} plant=${f2(rep.plant)} d=${s.distToTech} el=${s.elevationDeg} compact=${s.ui.inspectorCompact}` + (m ? ` | tech vis=${m.tech?.visible} h=${m.tech?.heightShare} ui=${m.tech?.underUi} | kit vis=${m.kit?.visible} ui=${m.kit?.underUi}` : ''));
  }
}
p('\nTRANSITIONS: settle ms, path m, peak m/s, reversals, overshoot m, frame dt p50/p95/max ms, frames > 50 ms');
for (const r of rows) {
  p(`\n${r.profile} ${r.lot}`);
  for (const [name, t] of Object.entries(r.transitions)) p(`  ${name.padEnd(22)} settle=${t.settleMs} path=${t.path} peak=${t.peakSpeed} rev=${t.reversals} over=${t.overshoot} dt=${t.dtP50}/${t.dtP95}/${t.dtMax} long=${t.longFrames}`);
}
p('\nCONTROLS: moved m, dist/azimuth before -> released, drift in the next 10 s, service view after');
for (const r of rows) {
  p(`\n${r.profile} ${r.lot}`);
  for (const [name, c] of Object.entries(r.controls)) p(`  ${name.padEnd(8)} moved=${c.moved} d ${c.before.dist}->${c.released.dist} az ${c.before.az}->${c.released.az} y ${c.before.y}->${c.released.y} drift10s=${c.driftAfter10s} view=${c.serviceView}`);
}
p('\nWALK-UP: reframes after Watch technician (t ms, reason, mode, fill) and technician path');
for (const r of rows) {
  const w = r.walkup;
  const tech = w.tech;
  const moving = tech.filter((t, i) => i && Math.hypot(t[1] - tech[i - 1][1], t[2] - tech[i - 1][2]) > 0.02);
  p(`${r.profile} ${r.lot}: ${w.reframes.map((f) => `${f.t}:${f.reason}/${f.mode}`).join(' ')} | tech moving ${moving.length ? moving[0][0] + '-' + moving[moving.length - 1][0] + ' ms' : 'never'} statuses ${[...new Set(tech.map((t) => t[3]))].join(',')}`);
}
const text = out.join('\n');
fs.writeFileSync(path.join(root, 'summary.txt'), text);
console.log(text);
