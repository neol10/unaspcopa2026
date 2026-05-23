export async function trackFallback(event: string, details?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined') {
      // Lightweight client telemetry: console + best-effort POST to server logging endpoint
      // Keep this fire-and-forget and resilient to avoid impacting UX.
      // eslint-disable-next-line no-console
      console.warn('telemetry:fallback', event, details || {});
      void fetch('/api/logging/fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, details: details || {}, ts: Date.now() }),
      }).catch(() => {});
    } else {
      // server-side: log to console (no blocking work)
      // eslint-disable-next-line no-console
      console.warn('telemetry:fallback (server)', event, details || {});
    }
  } catch {
    // swallow
  }
}

export default trackFallback;
