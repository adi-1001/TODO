import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensureBuiltinQuestions, getAudioBlob } from './db/repo';
import { soundEngine } from './audio/soundEngine';
import { isNativeApp } from './native/platform';
import './sync/syncEngine';
import './index.css';

// The Android app ships its files inside the APK, so a service worker would only add a stale
// cache. Over http:// LAN addresses browsers have no service worker at all.
if (!isNativeApp() && typeof window !== 'undefined' && window.isSecureContext) {
  try {
    registerSW({ immediate: true });
  } catch (e) {
    console.error('Offline support could not start', e);
  }
}

soundEngine.setTrackLoader(getAudioBlob);

// Ask the browser to keep IndexedDB (including uploaded tracks) when storage runs low.
try {
  void navigator.storage?.persist?.()?.catch(() => false);
} catch {
  /* not available on this page */
}

const root = createRoot(document.getElementById('root')!);

// The database starts empty. Only the built-in reflection questions are added.
ensureBuiltinQuestions()
  .catch((e) => console.error('Could not prepare the local database', e))
  .finally(() => {
    root.render(
      <StrictMode>
        <ErrorBoundary scope="app">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
