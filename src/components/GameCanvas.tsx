import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../game/engine';
import { computeStageSize } from '../game/layout';

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
      // Keep the 9:16 world intact and letterbox it instead of stretching it.
      // This is what keeps the engine's X/Y scale equal on every screen.
      const { width, height } = computeStageSize(rect.width, rect.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
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

    // Listen on the full stage container, not just the canvas: after
    // letterboxing, the bars above/below the 9:16 canvas must still register
    // taps, otherwise the bottom strip becomes a dead zone in a one-tap game.
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateDimensions);
      }
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine, onTap]);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[#010a17] select-none touch-none ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* The canvas is sized in JS by computeStageSize() to a strict 9:16 box;
          the surrounding area is intentionally letterboxed. */}
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="block touch-none cursor-pointer"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};
