import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installGlobalCrashListeners, recordCrash } from './app/diagnostics';
import { ErrorBoundary } from './ui/overlays/ErrorBoundary';
import { AppRecovery } from './ui/overlays/Recovery';
import './ui/styles.css';

installGlobalCrashListeners();

/**
 * Last resort, without React: shown when an error got past every boundary (the recovery screen itself could not
 * be drawn), at which point React has unmounted everything and the page would be empty. Nothing is saved or
 * deleted here; the saves on the device are as they were.
 */
function showStaticRecovery(): void {
  if (document.getElementById('static-recovery')) return;
  const box = document.createElement('div');
  box.id = 'static-recovery';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-label', 'The game stopped');
  box.setAttribute('data-testid', 'recovery-static');
  box.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:#0b0f14;color:#eef2f6;font:14px/1.5 Inter,system-ui,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:420px;display:flex;flex-direction:column;gap:14px;';
  const title = document.createElement('h2');
  title.textContent = 'The game stopped';
  title.style.cssText = 'margin:0;font-size:20px;';
  const text = document.createElement('p');
  text.textContent = 'EGO HVAC Empire ran into an error it could not recover from on its own. Your saved company on this device has not been changed or deleted. Reload to return to it.';
  text.style.cssText = 'margin:0;color:#9aa6b4;';
  const button = document.createElement('button');
  button.textContent = 'Reload the game';
  button.setAttribute('data-testid', 'recovery-reload');
  button.style.cssText = 'min-height:44px;padding:11px 16px;border:0;border-radius:10px;background:#19d3c5;color:#04211f;font:inherit;font-weight:700;cursor:pointer;';
  button.addEventListener('click', () => location.reload());
  card.append(title, text, button);
  box.append(card);
  document.body.append(box);
}

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, info) => {
    recordCrash('fatal', error, info.componentStack);
    console.error('[crash] unrecoverable rendering error', error);
    showStaticRecovery();
  },
}).render(
  <StrictMode>
    <ErrorBoundary scope="app" fallback={(p) => <AppRecovery {...p} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
