import { forwardRef } from 'react';

export interface RibbonLabelProps {
  /** Stage-space left edge (from `worldToStage`). */
  x: number;
  /** Stage-space top edge (from `worldToStage`). */
  y: number;
  /** The personal-best score the ribbon marks. */
  target: number;
  /** False while the ribbon is off-screen or the 2D fallback owns the badge. */
  visible: boolean;
}

/**
 * Personal-best ribbon badge for the GL path.
 *
 * The 11 px Canvas 2D text was the only in-canvas text and is a capture-upscale
 * casualty, so GL mode renders it as crisp DOM instead. GameCanvas positions it
 * imperatively from `worldToStage` in `afterRender` (no React state per frame).
 * `-translate-x-1/2` keeps it centred on the ribbon line like the 2D badge.
 */
export const RibbonLabel = forwardRef<HTMLDivElement, RibbonLabelProps>(
  function RibbonLabel({ x, y, target, visible }, ref) {
    return (
      <div
        ref={ref}
        data-testid="ribbon-label"
        aria-hidden={!visible}
        className="pointer-events-none absolute z-[15] -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-200/90 bg-amber-600/90 px-2 py-0.5 text-[11px] font-bold leading-tight text-white shadow-[0_0_8px_rgba(250,204,21,0.8)] select-none"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          opacity: visible ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        BEST: {target}
      </div>
    );
  }
);

RibbonLabel.displayName = 'RibbonLabel';
