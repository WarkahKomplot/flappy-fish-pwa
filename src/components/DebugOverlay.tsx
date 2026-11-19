import { useEffect, useState, type MutableRefObject } from 'react';
import type { QualityTier } from '../game/rendering/types';

/** Snapshot of the numbers GameCanvas writes once per frame in `?debug=1`. */
export interface DebugMetrics {
  fps: number;
  p50: number;
  p95: number;
  tier: QualityTier;
  captureWidth: number;
  captureHeight: number;
  postWidth: number;
  postHeight: number;
}

export const EMPTY_DEBUG_METRICS: DebugMetrics = {
  fps: 0,
  p50: 0,
  p95: 0,
  tier: 'off',
  captureWidth: 0,
  captureHeight: 0,
  postWidth: 0,
  postHeight: 0,
};

export interface DebugOverlayProps {
  visible: boolean;
  metricsRef: MutableRefObject<DebugMetrics>;
}

function size(width: number, height: number): string {
  return width > 0 && height > 0 ? `${width}\u00d7${height}` : '\u2014';
}

/**
 * QA frame-stats overlay (`?debug=1`). It reads a mutable ref on a 500 ms
 * interval instead of making GameCanvas re-render React every frame, and it
 * renders nothing at all in a normal production load.
 */
export function DebugOverlay({ visible, metricsRef }: DebugOverlayProps) {
  const [metrics, setMetrics] = useState<DebugMetrics>(() => ({
    ...metricsRef.current,
  }));

  useEffect(() => {
    if (!visible) {
      return;
    }

    setMetrics({ ...metricsRef.current });
    const interval = window.setInterval(() => {
      setMetrics({ ...metricsRef.current });
    }, 500);

    return () => window.clearInterval(interval);
  }, [visible, metricsRef]);

  if (!visible) {
    return null;
  }

  return (
    <div
      data-testid="debug-overlay"
      className="pointer-events-none absolute left-1 top-1 z-[60] select-none rounded bg-slate-950/80 px-1.5 py-1 font-mono text-[10px] leading-tight text-emerald-200 shadow-lg"
    >
      <div>
        FPS {metrics.fps} &middot; p50 {metrics.p50.toFixed(1)} ms &middot; p95{' '}
        {metrics.p95.toFixed(1)} ms
      </div>
      <div>
        tier {metrics.tier} &middot; capture{' '}
        {size(metrics.captureWidth, metrics.captureHeight)} &middot; post{' '}
        {size(metrics.postWidth, metrics.postHeight)}
      </div>
    </div>
  );
}
