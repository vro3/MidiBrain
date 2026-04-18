import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import { initTelemetry } from './telemetry.ts';
import { runLocalStorageMigrations } from './migrations.ts';
import './index.css';

// Run localStorage key migrations before any component reads state from it.
runLocalStorageMigrations();
initTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
