/**
 * Crash diagnostics: what failed, where, and in what kind of situation, for the recovery screens and for a
 * player to copy into a bug report.
 *
 * Privacy: a report is kept in this browser only (memory and localStorage) and is never sent anywhere; the
 * player decides whether to copy it. It holds no company, employee or customer names, no money and no save
 * contents; only the campaign seed and day (enough to replay a deterministic campaign), counts, and the
 * build and device class. Addresses in stack traces are cut down to file names, so no host, folder or query
 * string is kept.
 */

/** Where a failure was caught. */
export type CrashScope =
  /** The whole application tree (root boundary). */
  | 'app'
  /** The 3D world (the canvas and everything drawn in it). */
  | 'world'
  /** The heads-up display: bars, inspector, overlays. */
  | 'hud'
  /** One open panel (Jobs, Team, Fleet…). */
  | 'panel'
  /** The off-screen vehicle preview warm-up (a second WebGL context on desktops). */
  | 'preview'
  /** The simulation step, outside React. */
  | 'simulation'
  /** Any other script error or rejected promise: recorded only, nothing was unmounted. */
  | 'runtime'
  /** React could not render even the recovery screen. */
  | 'fatal';

export interface CrashContext {
  screen: string;
  panel: string | null;
  selection: string | null;
  serviceCamera: string | null;
  photoMode: boolean;
  quality: string;
  sceneReady: boolean;
  contextLost: boolean;
  /** Campaign seed and clock: the simulation is deterministic, so these locate the moment. Null with no game running. */
  game: { seed: number; day: number; minute: number; speed: number; schema: number; employees: number; vehicles: number; jobs: number } | null;
}

export interface CrashDevice {
  viewport: string;
  pixelRatio: number;
  touch: boolean;
  phone: boolean;
  tablet: boolean;
  lowEnd: boolean;
  webgl2: boolean;
  /** Browser family and major version only (never the full user-agent string). */
  browser: string;
}

export interface CrashReport {
  id: number;
  /** ISO time of the first occurrence. */
  at: string;
  scope: CrashScope;
  name: string;
  message: string;
  stack: string[];
  componentStack: string[];
  build: string;
  context: CrashContext | null;
  device: CrashDevice | null;
  /** How many times the same failure repeated (a failing frame callback throws every frame). */
  count: number;
}

export const CRASH_LOG_KEY = 'ego-hvac-v3:crash-log';
/** Reports kept in the log (newest last). */
export const CRASH_LOG_LIMIT = 5;
/** Different 'runtime' reports recorded per page load, so a noisy page cannot push the real failures out of the log. */
const SESSION_LIMIT = 25;
const MESSAGE_LIMIT = 300;
const STACK_LINES = 12;
const COMPONENT_LINES = 16;

/** Removes anything that could identify the player or their machine from one line of error text. */
export function scrubLine(line: string): string {
  return (
    line
      // http(s)/file/blob addresses → the file name (and line:column), without host, folders, query or hash.
      .replace(/(?:blob:)?(?:https?|file|webpack-internal|vite):\/\/[^\s)'"]+/gi, (url) => {
        const clean = url.replace(/[?#][^\s:)]*/, '');
        const position = /(:\d+){1,2}$/.exec(clean)?.[0] ?? '';
        const path = position ? clean.slice(0, -position.length) : clean;
        const file = path.split('/').filter(Boolean).pop() ?? '';
        return (/\.[a-z0-9]+$/i.test(file) ? file : '[page]') + position;
      })
      // Windows and POSIX absolute paths → the file name.
      .replace(/(?:[A-Za-z]:\\|\\\\)[^\s:)'"]*\\([^\\\s:)'"]+)/g, '$1')
      .replace(/(?:\/(?:Users|home|var|opt|tmp|mnt|private)\/)[^\s:)'"]*\/([^/\s:)'"]+)/g, '$1')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .trim()
  );
}

function lines(text: string | null | undefined, limit: number): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => scrubLine(l).slice(0, 200))
    .filter(Boolean)
    .slice(0, limit);
}

/** Browser family and major version from a user-agent string; everything else in it is dropped. */
export function browserFamily(ua: string): string {
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(ua);
    return m ? `${name} ${m[1]}` : null;
  };
  return (
    pick(/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge') ??
    pick(/SamsungBrowser\/(\d+)/, 'Samsung Internet') ??
    pick(/Firefox\/(\d+)/, 'Firefox') ??
    pick(/FxiOS\/(\d+)/, 'Firefox iOS') ??
    pick(/CriOS\/(\d+)/, 'Chrome iOS') ??
    pick(/Chrome\/(\d+)/, 'Chrome') ??
    pick(/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/, 'Safari') ??
    'Other'
  );
}

/** A thrown value of any kind as a name, a message and a stack. */
function describe(thrown: unknown): { name: string; message: string; stack: string } {
  if (thrown instanceof Error) return { name: thrown.name || 'Error', message: thrown.message, stack: thrown.stack ?? '' };
  if (typeof thrown === 'string') return { name: 'Error', message: thrown, stack: '' };
  let text: string;
  try {
    text = JSON.stringify(thrown) ?? String(thrown);
  } catch {
    text = String(thrown);
  }
  return { name: 'NonError', message: text, stack: '' };
}

let nextId = 1;

/** Builds a scrubbed report. Pure: the same inputs give the same report, apart from the id. */
export function buildReport(
  scope: CrashScope,
  thrown: unknown,
  extra: { componentStack?: string | null; context?: CrashContext | null; device?: CrashDevice | null; build?: string; at?: Date } = {},
): CrashReport {
  const { name, message, stack } = describe(thrown);
  const stackLines = lines(stack, STACK_LINES + 1);
  // V8 repeats "Name: message" as the first stack line.
  if (stackLines.length && stackLines[0].includes(scrubLine(message).slice(0, 40)) && !/^\s*at\s/.test(stackLines[0])) stackLines.shift();
  return {
    id: nextId++,
    at: (extra.at ?? new Date()).toISOString(),
    scope,
    name: scrubLine(name).slice(0, 60),
    message: scrubLine(message).slice(0, MESSAGE_LIMIT),
    stack: stackLines.slice(0, STACK_LINES),
    componentStack: lines(extra.componentStack, COMPONENT_LINES),
    build: extra.build ?? 'unknown',
    context: extra.context ?? null,
    device: extra.device ?? null,
    count: 1,
  };
}

/** Plain text for the "Technical details" box and the clipboard. */
export function formatReport(r: CrashReport): string {
  const out: string[] = [];
  out.push(`EGO HVAC Empire crash report`);
  out.push(`Build: ${r.build}`);
  out.push(`When: ${r.at}${r.count > 1 ? ` (repeated ${r.count} times)` : ''}`);
  out.push(`Where: ${r.scope}`);
  out.push(`Error: ${r.name}: ${r.message}`);
  if (r.context) {
    const c = r.context;
    out.push(`Screen: ${c.screen}${c.panel ? `, panel ${c.panel}` : ''}${c.selection ? `, ${c.selection} selected` : ''}${c.serviceCamera ? `, service camera ${c.serviceCamera}` : ''}${c.photoMode ? ', photo mode' : ''}`);
    out.push(`Graphics: ${c.quality}, scene ${c.sceneReady ? 'ready' : 'starting'}${c.contextLost ? ', WebGL context lost' : ''}`);
    out.push(c.game ? `Campaign: seed ${c.game.seed}, day ${c.game.day}, minute ${c.game.minute}, speed ${c.game.speed}, save schema ${c.game.schema}; ${c.game.employees} staff, ${c.game.vehicles} vehicles, ${c.game.jobs} jobs` : 'Campaign: none running');
  }
  if (r.device) {
    const d = r.device;
    const kind = d.phone ? 'phone' : d.tablet ? 'tablet' : 'desktop';
    out.push(`Device: ${kind}${d.touch ? ', touch' : ''}${d.lowEnd ? ', low-end' : ''}, ${d.viewport} at ${d.pixelRatio}x, ${d.browser}, WebGL 2 ${d.webgl2 ? 'yes' : 'no'}`);
  }
  if (r.stack.length) out.push('', 'Stack:', ...r.stack.map((l) => `  ${l}`));
  if (r.componentStack.length) out.push('', 'Components:', ...r.componentStack.map((l) => `  ${l}`));
  return out.join('\n');
}

/**
 * Adds a report to a log, newest last. A repeat of the newest entry is counted instead of stored again. The
 * same failure is often seen twice, once by a recovery boundary and once as a plain script error (the 3D
 * renderer reports what it passes up): the boundary's report is the one kept.
 */
export function appendReport(log: CrashReport[], report: CrashReport, limit = CRASH_LOG_LIMIT): CrashReport[] {
  const last = log[log.length - 1];
  if (last && last.name === report.name && last.message === report.message) {
    if (last.scope === report.scope || report.scope === 'runtime') return [...log.slice(0, -1), { ...last, count: last.count + 1 }];
    if (last.scope === 'runtime') return [...log.slice(0, -1), { ...report, at: last.at }];
  }
  return [...log, report].slice(-limit);
}

// ---------------------------------------------------------------------------------------------------------------------
// The live log (browser). Everything below tolerates a missing window or a blocked localStorage.

let log: CrashReport[] | null = null;
let recorded = 0;
let providers: { context: () => CrashContext | null; device: () => CrashDevice | null } | null = null;

/** The store registers how to describe the current situation (kept out of this module so it has no game imports). */
export function setDiagnosticProviders(p: NonNullable<typeof providers>): void {
  providers = p;
}

function readLog(): CrashReport[] {
  if (log) return log;
  log = [];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CRASH_LOG_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) log = (parsed as CrashReport[]).filter((r) => r && typeof r.message === 'string').slice(-CRASH_LOG_LIMIT);
  } catch {
    /* unreadable log: start empty */
  }
  return log;
}

function writeLog(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(log));
  } catch {
    /* storage full or blocked: the report stays in memory */
  }
}

function safely<T>(read: (() => T) | undefined): T | null {
  try {
    return read ? read() : null;
  } catch {
    return null;
  }
}

/** Records a failure and returns its report (the stored one when it is a repeat). Never throws. */
export function recordCrash(scope: CrashScope, thrown: unknown, componentStack?: string | null): CrashReport {
  let report: CrashReport;
  try {
    report = buildReport(scope, thrown, {
      componentStack,
      context: safely(providers?.context),
      device: safely(providers?.device),
      build: typeof __APP_VERSION__ === 'string' ? `${__APP_VERSION__} (${__BUILD_ID__})` : 'unknown',
    });
  } catch {
    report = { id: nextId++, at: new Date().toISOString(), scope, name: 'Error', message: 'An error that could not be described.', stack: [], componentStack: [], build: 'unknown', context: null, device: null, count: 1 };
  }
  try {
    const before = readLog();
    const after = appendReport(before, report);
    const repeat = after[after.length - 1].id !== report.id;
    // Only background noise is capped: a failure that put a recovery screen up is always kept.
    if (!repeat && scope === 'runtime' && ++recorded > SESSION_LIMIT) return report;
    log = after;
    // A repeating failure (every frame) is written once per power of two, not sixty times a second.
    const stored = after[after.length - 1];
    if (!repeat || (stored.count & (stored.count - 1)) === 0) writeLog();
    return stored;
  } catch {
    return report;
  }
}

/** The stored reports, oldest first. */
export function crashLog(): CrashReport[] {
  return [...readLog()];
}

export function clearCrashLog(): void {
  log = [];
  writeLog();
}

let listening = false;

/**
 * Records script errors and rejected promises that no error boundary sees (event handlers, timers, frame
 * callbacks, asset loads). Recording only: these do not unmount anything, so nothing is shown for them.
 */
export function installGlobalCrashListeners(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('error', (e) => {
    // Resource load errors (an <img> or <script>) arrive here without an error object: not a script failure.
    if (e.error === undefined && !e.message) return;
    recordCrash('runtime', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => recordCrash('runtime', e.reason ?? 'Unhandled promise rejection'));
}
