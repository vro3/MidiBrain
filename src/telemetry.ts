// Telemetry stub. In dev, logs to console. For commercial builds, swap this
// to Sentry by:
//
//   1. npm i @sentry/electron
//   2. In electron/main.cjs: require('@sentry/electron/main').init({ dsn: '...' })
//   3. In this file: import * as Sentry from '@sentry/electron/renderer'
//      and forward captureException below.
//   4. Set SENTRY_DSN in your release env; skip init in dev.
//
// Keeping this abstraction means no code outside this file needs to know
// whether telemetry is wired up.

export function initTelemetry(): void {
  // No-op in v1. Sentry init goes here.
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      captureException(e.error ?? new Error(e.message), { source: 'window.error' });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = (e as PromiseRejectionEvent).reason;
      captureException(reason instanceof Error ? reason : new Error(String(reason)), {
        source: 'unhandledrejection',
      });
    });
  }
}

export function captureException(err: Error, context: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.error('[telemetry]', err.message, { stack: err.stack, ...context });
}

export function captureMessage(msg: string, context: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.log('[telemetry]', msg, context);
}
