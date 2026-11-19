import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/engine';
import { PHYSICS_CONSTANTS } from '../game/constants';
import { PostFXController } from '../game/rendering/postFx';
import { selectQuality } from '../game/rendering/quality';
import {
  computeCaptureSize,
  computeGameRect,
  type GameRect,
} from '../game/rendering/geometry';
import type { PostFXBackend } from '../game/rendering/backend';
import { WebGLBackend } from '../game/rendering/webglBackend';
import type { FxPreference, QualityTier } from '../game/rendering/types';

const WORLD_WIDTH = PHYSICS_CONSTANTS.CANVAS_WIDTH;
const WORLD_HEIGHT = PHYSICS_CONSTANTS.CANVAS_HEIGHT;

/** Production factory; tests inject a fake through `backendFactory`. */
const defaultBackendFactory = (): PostFXBackend => new WebGLBackend();

function visibleDpr(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function isDesktopPointer(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    );
  } catch {
    return false;
  }
}

function readDeviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' ? memory : undefined;
}

export interface GameCanvasProps {
  engine: GameEngine;
  onTap?: () => void;
  className?: string;
  fxPreference?: FxPreference;
  onEffectiveTierChange?: (tier: QualityTier) => void;
  /**
   * Creates the post-FX backend. The default is the real WebGL2 backend; the
   * factory may return null (or the backend's init may fail) to force the
   * exact Canvas 2D path, which is what the fallback tests do.
   */
  backendFactory?: () => PostFXBackend | null;
}

/**
 * Two-canvas stage:
 * - the scene canvas is the engine's Canvas 2D surface, always in the DOM so
 *   the fallback is instant and iOS cannot discard its backing store;
 * - the FX canvas is the full-stage WebGL2 compositor output and never
 *   receives pointer events (input stays on the stage container).
 *
 * The GL/controller effect is mount-only (`[engine]`) so a tap-driven
 * `onTap` identity change cannot re-initialise GL mid-game. Input lives in a
 * separate effect behind a ref.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  onTap,
  className = '',
  fxPreference = 'auto',
  onEffectiveTierChange,
  backendFactory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const [glActive, setGlActive] = useState(false);

  // Latest-prop refs: the mount-only effect reads these once, and a later
  // Task 10 preference switch can change them without re-initialising GL.
  const onTapRef = useRef(onTap);
  const fxPreferenceRef = useRef(fxPreference);
  const backendFactoryRef = useRef(backendFactory);
  const onEffectiveTierChangeRef = useRef(onEffectiveTierChange);
  const glMountedRef = useRef(false);

  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  useEffect(() => {
    fxPreferenceRef.current = fxPreference;
  }, [fxPreference]);

  useEffect(() => {
    backendFactoryRef.current = backendFactory;
  }, [backendFactory]);

  useEffect(() => {
    onEffectiveTierChangeRef.current = onEffectiveTierChange;
  }, [onEffectiveTierChange]);

  useEffect(() => {
    // StrictMode double-invokes mount effects in development; the cleanup
    // below resets this so a real remount still initialises.
    if (glMountedRef.current) {
      return;
    }
    glMountedRef.current = true;

    const container = containerRef.current;
    const sceneCanvas = sceneCanvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!container || !sceneCanvas || !fxCanvas) {
      glMountedRef.current = false;
      return;
    }

    engine.attachCanvas(sceneCanvas);
    engine.afterRender = undefined;
    engine.backgroundVisible = true;

    let controller: PostFXController | null = null;
    let available = false;
    let glVisible = false;
    let disposed = false;

    const positionScene = (gameRect: GameRect) => {
      // Fractional origin on purpose: rounding 75.5 to 75 leaves a one-pixel
      // seam between the GL background and the composited scene.
      sceneCanvas.style.width = `${gameRect.width}px`;
      sceneCanvas.style.height = `${gameRect.height}px`;
      sceneCanvas.style.transform = `translate3d(${gameRect.x}px, ${gameRect.y}px, 0)`;
    };

    const sizeFallback = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const gameRect = computeGameRect(rect.width, rect.height);
        positionScene(gameRect);
        engine.resize(gameRect.width, gameRect.height, visibleDpr());
      } else {
        // Unmeasured (jsdom / first paint): keep the exact 360x640 2D look.
        engine.resize(WORLD_WIDTH, WORLD_HEIGHT, visibleDpr());
      }
    };

    const showSceneOnly = () => {
      glVisible = false;
      engine.afterRender = undefined;
      engine.backgroundVisible = true;
      if (!disposed) {
        setGlActive(false);
      }
    };

    const enterFallback = () => {
      showSceneOnly();
      available = false;

      if (controller) {
        try {
          controller.dispose();
        } catch {
          // A partially initialised backend may throw while releasing; the
          // Canvas 2D path is already visible at this point.
        }
        controller = null;
      }

      sizeFallback();
      // Reported last: the UI must never show a non-Off tier after a failure.
      onEffectiveTierChangeRef.current?.('off');
    };

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const stageW = rect.width;
      const stageH = rect.height;

      if (!(stageW > 0 && stageH > 0)) {
        // Unmeasured: skip GL resize/rendering and keep the 2D fallback at the
        // world size until a real measurement arrives.
        if (glVisible) {
          showSceneOnly();
        }
        engine.resize(WORLD_WIDTH, WORLD_HEIGHT, visibleDpr());
        return;
      }

      const gameRect = computeGameRect(stageW, stageH);
      positionScene(gameRect);

      if (!controller || !available) {
        showSceneOnly();
        engine.resize(gameRect.width, gameRect.height, visibleDpr());
        return;
      }

      const profile = controller.profile;
      if (!profile) {
        // Effective tier Off: keep the controller alive for a later
        // preference switch, but render the exact Canvas 2D path.
        showSceneOnly();
        engine.resize(gameRect.width, gameRect.height, visibleDpr());
        return;
      }

      // The scene buffer is the capped capture buffer; the backend samples it
      // into the game rect. The engine renders it at dpr 1 because the buffer
      // size already includes captureDpr.
      const capture = computeCaptureSize(gameRect, profile.captureDpr);
      try {
        engine.resize(capture.width, capture.height, 1);
        controller.resize(stageW, stageH, gameRect);
      } catch {
        enterFallback();
        return;
      }

      // Draw one frame *before* hiding the 2D scene. If the GPU path cannot
      // render, the user never sees a black/frozen stage and we fall back
      // while the Canvas 2D result is still on screen.
      try {
        controller.render(engine.getSceneSnapshot());
      } catch {
        enterFallback();
        return;
      }

      glVisible = true;
      engine.backgroundVisible = false;
      engine.afterRender = (snapshot) => {
        try {
          controller?.render(snapshot);
        } catch {
          enterFallback();
        }
      };
      if (!disposed) {
        setGlActive(true);
      }

      // Start the idle rAF loop so the start screen shows the animated
      // full-bleed background and idle fish before the first tap. This is
      // idempotent and only runs on the GL path; the 2D fallback keeps
      // today's start-screen behaviour.
      engine.startLoop();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', updateDimensions);
    }

    const factory = backendFactoryRef.current ?? defaultBackendFactory;
    let backend: PostFXBackend | null = null;
    try {
      backend = factory();
    } catch {
      backend = null;
    }

    if (!backend) {
      enterFallback();
    } else {
      const reducedMotion = prefersReducedMotion();
      controller = new PostFXController(backend, {
        reducedMotion,
        onTierChange: (tier) => {
          // Only report while the controller is usable; init failure reports
          // Off through enterFallback below.
          if (available && !disposed) {
            onEffectiveTierChangeRef.current?.(tier);
          }
        },
      });

      let initialised = false;
      try {
        initialised = controller.init(fxCanvas, sceneCanvas);
      } catch {
        initialised = false;
      }

      if (!initialised) {
        available = false;
        enterFallback();
      } else {
        available = true;
        const autoTier = selectQuality({
          webgl2: true,
          reducedMotion,
          hardwareConcurrency:
            (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
          deviceMemory: readDeviceMemory(),
          isDesktop: isDesktopPointer(),
          override: null,
        });

        try {
          controller.setPreference(fxPreferenceRef.current, autoTier);
        } catch {
          enterFallback();
        }

        if (available) {
          updateDimensions();
        }
      }
    }

    return () => {
      disposed = true;
      glMountedRef.current = false;

      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateDimensions);
      }

      available = false;
      engine.afterRender = undefined;
      engine.backgroundVisible = true;

      if (controller) {
        try {
          controller.dispose();
        } catch {
          // Ignore release failures during unmount.
        }
        controller = null;
      }
    };
  }, [engine]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Direct non-passive touch listener eliminates the 300ms tap delay and
    // prevents iOS Safari elastic bounce / double-tap zoom.
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      engine.handleInput();
      onTapRef.current?.();
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Avoid double triggering if touchstart already handled the touch.
      if (e.pointerType === 'touch') {
        return;
      }
      e.preventDefault();
      engine.handleInput();
      onTapRef.current?.();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        engine.handleInput();
        onTapRef.current?.();
      }
    };

    // Listen on the full stage container, not just the canvas: the bars
    // above/below the 9:16 canvas must still register taps in a one-tap game.
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-[#010a17] select-none touch-none ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* Scene canvas: the engine's Canvas 2D surface. It stays in the DOM at
          opacity 0 while GL is active (display:none can make iOS discard the
          backing store and would make the fallback a repaint, not a reveal). */}
      <canvas
        ref={sceneCanvasRef}
        data-testid="game-canvas"
        className="absolute block touch-none cursor-pointer"
        style={{
          left: 0,
          top: 0,
          touchAction: 'none',
          opacity: glActive ? 0 : 1,
          pointerEvents: glActive ? 'none' : 'auto',
        }}
      />

      {/* FX canvas: the only visible canvas on the GL path and never a tap
          target; input is bound to the stage container. */}
      <canvas
        ref={fxCanvasRef}
        data-testid="fx-canvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 block h-full w-full"
        style={{ display: glActive ? 'block' : 'none' }}
      />
    </div>
  );
};
