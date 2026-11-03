#!/usr/bin/env node
/**
 * Runs one heavy command with a memory floor, in the foreground, and records what happened.
 *
 *   node tools/run-guarded.mjs <log file> <label> -- <command...>
 *
 * Refuses to start under GUARD_START_MB of available RAM (default 2500). While the command runs, available RAM is read every
 * two seconds; under GUARD_FLOOR_MB (default 1200) this script stops that command's own process tree and exits 99. It never
 * touches any other process, and it does not retry: a run that hit the floor is for the owner to decide about.
 *
 * Appends to the log: label, exit code, seconds, available RAM at the start and at the lowest point, and the Playwright
 * summary line if there is one.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { freemem } from 'node:os';

const [logFile, label, sep, ...cmd] = process.argv.slice(2);
if (!logFile || !label || sep !== '--' || !cmd.length) {
  console.error('usage: node tools/run-guarded.mjs <log file> <label> -- <command...>');
  process.exit(2);
}
const START_MB = Number(process.env.GUARD_START_MB ?? 2500);
const FLOOR_MB = Number(process.env.GUARD_FLOOR_MB ?? 1200);
const mb = () => Math.round(freemem() / 1048576);
mkdirSync(dirname(logFile), { recursive: true });
const record = (line) => appendFileSync(logFile, `${line}\n`);

const startFree = mb();
if (startFree < START_MB) {
  record(`${label} NOT STARTED: ${startFree} MB available, under the ${START_MB} MB needed to start`);
  console.error(`[guard] not started: ${startFree} MB available (needs ${START_MB})`);
  process.exit(98);
}

const t0 = Date.now();
let minFree = startFree;
let hitFloor = false;
let summary = '';
const child = spawn(cmd.join(' '), { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const pass = (out) => (d) => {
  out.write(d);
  for (const l of String(d).split(/\r?\n/)) if (/^\s*\d+ (passed|failed|skipped|did not run|interrupted)/.test(l)) summary += `${l.trim()}; `;
};
child.stdout.on('data', pass(process.stdout));
child.stderr.on('data', pass(process.stderr));
const watch = setInterval(() => {
  const free = mb();
  minFree = Math.min(minFree, free);
  if (free < FLOOR_MB && !hitFloor) {
    hitFloor = true;
    console.error(`[guard] ${free} MB available, under the ${FLOOR_MB} MB floor: stopping this run`);
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else child.kill('SIGKILL');
  }
}, 2000);
child.on('close', (code) => {
  clearInterval(watch);
  const secs = Math.round((Date.now() - t0) / 1000);
  const exit = hitFloor ? 99 : (code ?? 1);
  record(`${label} exit=${exit}${hitFloor ? ' STOPPED AT MEMORY FLOOR' : ''} ${summary}secs=${secs} availStartMB=${startFree} availMinMB=${minFree} usedMB=${startFree - minFree}`);
  console.log(`[guard] ${label} exit=${exit} secs=${secs} availStartMB=${startFree} availMinMB=${minFree}`);
  process.exit(exit);
});
