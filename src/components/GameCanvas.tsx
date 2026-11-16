import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../game/engine';

export interface GameCanvasProps {
  engine: GameEngine;
  onTap?: () => void;
  className?: string;
}

/**
 * 60fps HTML5 Canvas wrapper with DPR High-DPI scaling,
 * zero-latency non-passive direct touch/pointer listener binding,
 * and GameEngine lifecycle attachment.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  onTap,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Attach canvas to engine and initialize rendering context
    engine.attachCanvas(canvas);

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || 360;
      const height = rect.height || 640;
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      engine.resize(width, height, dpr);
    };

    updateDimensions();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
      });
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', updateDimensions);
    }

    // Direct non-passive touch listener eliminates the 300ms tap delay
    // and prevents iOS safari elastic bounce and double-tap zoom
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      engine.handleInput();
      onTap?.();
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Avoid double triggering if touchstart already handled the touch
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      engine.handleInput();
      onTap?.();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        engine.handleInput();
        onTap?.();
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateDimensions);
      }
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine, onTap]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none touch-none ${className}`}
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="w-full h-full block touch-none cursor-pointer"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};
