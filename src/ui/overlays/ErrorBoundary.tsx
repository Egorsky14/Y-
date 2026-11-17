import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordCrash, type CrashReport, type CrashScope } from '@/app/diagnostics';
import { CRASH_HOOKS, useApp, type CrashTestScope } from '@/app/store';

export interface RecoveryProps {
  /** What was recorded about the failure (null for the instant between the throw and the commit). */
  report: CrashReport | null;
  /** How many times this boundary has caught a failure since it mounted: above 1, trying again has already failed. */
  failures: number;
  /** Render the children again. */
  retry: () => void;
}

interface Props {
  scope: CrashScope;
  fallback: (props: RecoveryProps) => ReactNode;
  /** Runs once per caught failure, after it is recorded (e.g. pause the game). */
  onCatch?: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
  report: CrashReport | null;
  failures: number;
}

/**
 * Catches exceptions thrown while rendering its children (and in their effects and lifecycles) and shows a
 * recovery view in their place, so one failing part does not take the page down: without a boundary React
 * unmounts the whole tree and leaves an empty page.
 *
 * What it cannot catch: errors in event handlers, timers, promises and frame callbacks (those do not unmount
 * anything; src/app/diagnostics.ts records them), an exception in the simulation step (src/app/gameLoop.ts
 * handles that), and a lost WebGL context, which is not an exception at all (GameScene and ContextLostOverlay).
 *
 * The 3D canvas is a separate React renderer, but it passes what its own tree throws up to the boundary around it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, report: null, failures: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const report = recordCrash(this.props.scope, error, info.componentStack);
    this.setState((s) => ({ report, failures: s.failures + 1 }));
    try {
      this.props.onCatch?.();
    } catch {
      /* recovery must not fail because its side effect did */
    }
  }

  retry = (): void => this.setState({ failed: false, report: null });

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback({ report: this.state.report, failures: this.state.failures, retry: this.retry });
  }
}

/**
 * Crash-test builds and the dev server only: throws while rendering when window.__ego.crash(scope) asked for it.
 * One placed in each boundary's subtree lets the end-to-end tests break exactly that part. A one-shot request is
 * cleared as it fires, so "try again" then succeeds; a sticky one keeps failing.
 *
 * In a production build __CRASH_HOOKS__ is the literal false: the component is an empty function, nothing can make
 * it throw, and the bundler drops the rest.
 */
export function CrashProbe({ scope, also }: { scope: CrashTestScope; also?: CrashTestScope }) {
  const test = useApp((s) => (CRASH_HOOKS ? s.crashTest : null));
  if (CRASH_HOOKS && test && (test.scope === scope || test.scope === also)) {
    // 'fatal' is two probes (the app and its recovery screen): it stays set so both fire.
    if (!test.sticky && test.scope !== 'fatal') queueMicrotask(() => useApp.getState().setCrashTest(null));
    throw new Error(`Simulated ${scope} rendering failure (window.__ego.crash).`);
  }
  return null;
}
