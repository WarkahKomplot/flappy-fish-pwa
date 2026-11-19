import React, {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { GameEngine } from '../game/engine';
import { PHYSICS_CONSTANTS } from '../game/constants';
import { PostFXController } from '../game/rendering/postFx';
import { nextTier, selectQuality } from '../game/rendering/quality';
import { FrameStats } from '../game/rendering/frameStats';
import { applyVisualFixture } from '../game/rendering/visualFixture';
import { DEFAULT_QA_FLAGS, type QaFlags } from '../game/rendering/qa';
import {
  computeCaptureSize,
  computeGameRect,
  worldToStage,
  type GameRect,
} from '../game/rendering/geometry';
import type { PostFXBackend } from '../game/rendering/backend';
import { WebGLBackend } from '../game/rendering/webglBackend';
import type {
  FxPreference,
  QualityTier,
  SceneSnapshot,
} from '../game/rendering/types';
import { RibbonLabel } from './RibbonLabel';
import type { DebugMetrics } from './DebugOverlay';

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

/**
 * Interactive overlay controls own their keyboard events. Without this guard
 * the window-level Space/ArrowUp tap handler would start or flap the game
 * while a start-screen button or an FX-panel radio has focus.
 */
const GAME_INPUT_IGNORED_SELECTOR =
  'button, input, select, textarea, a, [role="dialog"]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(GAME_INPUT_IGNORED_SELECTOR) !== null
  );
}

export interface GameCanvasProps {
  engine: GameEngine;
  onTap?: () => void;
  className?: string;
  fxPreference?: FxPreference;
  onEffectiveTierChange?: (tier: QualityTier) => void;
  /** Opt-in `?debug` / `?benchmark` / `?freeze` QA switches. */
  qaFlags?: QaFlags;
  /** Filled in by this component when `qaFlags.debug` is on. */
  metricsRef?: MutableRefObject<DebugMetrics>;
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
  qaFlags = DEFAULT_QA_FLAGS,
  metricsRef,
  backendFactory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const ribbonLabelRef = useRef<HTMLDivElement>(null);
  const [glActive, setGlActive] = useState(false);

  // Latest-prop refs: the mount-only effect reads these once, and a later
  // preference switch can change them without re-initialising GL.
  const onTapRef = useRef(onTap);
  const fxPreferenceRef = useRef(fxPreference);
  const backendFactoryRef = useRef(backendFactory);
  const onEffectiveTierChangeRef = useRef(onEffectiveTierChange);
  const qaFlagsRef = useRef(qaFlags);
  const metricsRefRef = useRef(metricsRef);
  const glMountedRef = useRef(false);
  // Set by the mount effect so the preference-change effect can drive the one
  // shared applyPreference path; null while unmounted.
  const applyPreferenceRef = useRef<((pref: FxPreference) => void) | null>(null);
  // The last preference the effect applied. Guards against double-applying the
  // initial value when the change effect runs right after mount.
  const appliedPreferenceRef = useRef<FxPreference | null>(null);

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
    qaFlagsRef.current = qaFlags;
  }, [qaFlags]);

  useEffect(() => {
    metricsRefRef.current = metricsRef;
  }, [metricsRef]);

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

    const flags = qaFlagsRef.current;
    const frozen = flags.freeze;
    const metricsEnabled = flags.debug || flags.benchmark;

    // `?freeze` replaces the live scene with a deterministic paused frame
    // before the first resize/composite. Applying it here (not in a later
    // effect) means even the very first GL frame is the fixture, not a frame
    // of the idle simulation.
    if (frozen) {
      applyVisualFixture(engine, flags.time ?? 0, flags.seed ?? 1);
    }

    let controller: PostFXController | null = null;
    let available = false;
    let glVisible = false;
    let disposed = false;
    let hasApplied = false;
    // The measured stage is cached for the DOM ribbon label so afterRender can
    // map world -> stage without reading layout every frame.
    let currentGameRect: GameRect | null = null;
    let currentStageWidth = 0;
    let currentStageHeight = 0;

    // Frame-time instrumentation. `runStats` feeds the debug overlay and the
    // benchmark log for the whole run; `windowStats` is the ~5 s adaptive
    // window and is replaced after every evaluation.
    const runCapacity = flags.benchmark ? 3600 : 600;
    let runStats = new FrameStats(runCapacity);
    let windowStats = new FrameStats(600);
    let lastFrameAt = 0;
    let windowMs = 0;
    let downgradedThisRun = false;
    let previousStatus = engine.status;
    // The overlay polls at 500 ms; sorting the ring every frame would inflate
    // the very frame times ?debug is trying to measure.
    let nextMetricsAt = 0;

    const reducedMotion = prefersReducedMotion();
    // Hardware heuristics for the Auto option. `webgl2` is asserted because
    // this value is only consumed while a GL controller is being attempted;
    // a failed init still reports Off through the fallback path.
    let autoTier = selectQuality({
      webgl2: true,
      reducedMotion,
      hardwareConcurrency:
        (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
      deviceMemory: readDeviceMemory(),
      isDesktop: isDesktopPointer(),
      override: null,
    });

    const positionScene = (gameRect: GameRect) => {
      // Fractional origin on purpose: rounding 75.5 to 75 leaves a one-pixel
      // seam between the GL background and the composited scene.
      sceneCanvas.style.width = `${gameRect.width}px`;
      sceneCanvas.style.height = `${gameRect.height}px`;
      sceneCanvas.style.transform = `translate3d(${gameRect.x}px, ${gameRect.y}px, 0)`;
    };

    /**
     * Positions the DOM ribbon badge from the same fractional game rect the GL
     * compositor uses. Called from afterRender (never React state) so a moving
     * ribbon does not re-render the stage every frame.
     */
    const updateRibbonLabel = (snapshot: SceneSnapshot) => {
      const label = ribbonLabelRef.current;
      if (!label || !currentGameRect) {
        return;
      }

      const position = worldToStage(snapshot.ribbon.x, 110, currentGameRect);
      const visible =
        snapshot.ribbon.target > 0 &&
        position.x >= 0 &&
        position.x <= currentStageWidth;

      label.style.left = `${position.x}px`;
      label.style.top = `${position.y}px`;
      label.style.opacity = visible ? '1' : '0';
      label.setAttribute('aria-hidden', visible ? 'false' : 'true');
      label.textContent = `BEST: ${snapshot.ribbon.target}`;
    };

    const hideRibbonLabel = () => {
      const label = ribbonLabelRef.current;
      if (label) {
        label.style.opacity = '0';
        label.setAttribute('aria-hidden', 'true');
      }
    };

    /** Mirrors WebGLBackend.resize's capped post-buffer dimensions. */
    const computePostSize = () => {
      const profile = controller?.profile;
      if (!profile || currentStageWidth <= 0 || currentStageHeight <= 0) {
        return { width: 0, height: 0 };
      }

      let width = Math.max(1, Math.round(currentStageWidth * profile.postDpr));
      let height = Math.max(1, Math.round(currentStageHeight * profile.postDpr));
      if (width * height > profile.maxPostPixels) {
        const scale = Math.sqrt(profile.maxPostPixels / (width * height));
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
      }

      return { width, height };
    };

    const publishMetrics = () => {
      const ref = metricsRefRef.current;
      if (!flags.debug || !ref) {
        return;
      }

      const p50 = runStats.percentile(0.5);
      const p95 = runStats.percentile(0.95);
      const post = computePostSize();
      const metrics = ref.current;
      metrics.fps = p50 > 0 ? Math.round(1000 / p50) : 0;
      metrics.p50 = p50;
      metrics.p95 = p95;
      metrics.tier = controller?.tier ?? 'off';
      metrics.captureWidth = sceneCanvas.width;
      metrics.captureHeight = sceneCanvas.height;
      metrics.postWidth = post.width;
      metrics.postHeight = post.height;
    };

    const logBenchmark = () => {
      if (!flags.benchmark) {
        return;
      }

      const p50 = runStats.percentile(0.5);
      const p95 = runStats.percentile(0.95);
      const post = computePostSize();
      console.log(
        `[flappy-fish benchmark] p50=${p50.toFixed(1)}ms p95=${p95.toFixed(
          1
        )}ms tier=${controller?.tier ?? 'off'} capture=${sceneCanvas.width}x${
          sceneCanvas.height
        } post=${post.width}x${post.height}`
      );
    };

    /**
     * Per-frame QA/adaptation bookkeeping. Frame time is the interval between
     * presented frames (not simulation time), so a 30 fps display shows
     * ~33 ms and crosses the 20 ms adaptive threshold as intended.
     */
    const recordFrame = (snapshot: SceneSnapshot) => {
      const now =
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const status = snapshot.status;
      // A pause/resume is still the same run; only idle/gameover -> playing
      // opens a new one-downgrade budget.
      const newRun =
        status === 'playing' &&
        (previousStatus === 'idle' || previousStatus === 'gameover');

      if (newRun) {
        // Re-evaluate at every start/retry: fresh window, one downgrade budget.
        runStats = new FrameStats(runCapacity);
        windowStats = new FrameStats(600);
        windowMs = 0;
        downgradedThisRun = false;
        // Do not count the idle/menu gap before the first tap as a frame.
        lastFrameAt = 0;
      }

      if (status === 'playing' && lastFrameAt > 0) {
        const delta = now - lastFrameAt;
        // Ignore tab-suspension gaps and the first frame after a resume.
        if (delta > 0 && delta < 1000) {
          runStats.push(delta);
          windowStats.push(delta);
          windowMs += delta;
        }
      }
      lastFrameAt = now;

      if (status === 'gameover' && previousStatus === 'playing') {
        logBenchmark();
      }
      previousStatus = status;

      if (status === 'playing' && windowMs >= 5000) {
        // Adaptation is Auto-only and manual tiers disable it entirely.
        if (
          fxPreferenceRef.current === 'auto' &&
          !downgradedThisRun &&
          controller &&
          controller.tier !== 'off'
        ) {
          const p95 = windowStats.percentile(0.95);
          const next = nextTier(controller.tier, p95);
          if (next !== controller.tier) {
            downgradedThisRun = true;
            autoTier = next;
            try {
              controller.setPreference('auto', autoTier);
              // Re-measure: captureDpr changed with the profile.
              updateDimensions();
              reportAppliedTier();
            } catch {
              enterFallback();
            }
          }
        }

        windowMs = 0;
        windowStats = new FrameStats(600);
      }

      if (metricsEnabled && now >= nextMetricsAt) {
        nextMetricsAt = now + 500;
        publishMetrics();
      }
    };

    const renderAndRecord = (snapshot: SceneSnapshot) => {
      try {
        controller?.render(snapshot);
      } catch {
        enterFallback();
        return;
      }
      updateRibbonLabel(snapshot);
      recordFrame(snapshot);
    };

    const renderFrozenFallback = () => {
      if (!frozen || glVisible) {
        return;
      }

      const ctx = sceneCanvas.getContext('2d');
      if (!ctx) {
        return;
      }

      try {
        if (currentGameRect) {
          engine.render(
            ctx,
            currentGameRect.width,
            currentGameRect.height,
            visibleDpr()
          );
        } else {
          engine.render(ctx, WORLD_WIDTH, WORLD_HEIGHT, visibleDpr());
        }
      } catch {
        // A mock/partial 2D context must not break mounting; the real scene
        // renderer throws only in environments without a usable context.
      }
    };

    const sizeFallback = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const gameRect = computeGameRect(rect.width, rect.height);
        currentGameRect = gameRect;
        currentStageWidth = rect.width;
        currentStageHeight = rect.height;
        positionScene(gameRect);
        engine.resize(gameRect.width, gameRect.height, visibleDpr());
      } else {
        // Unmeasured (jsdom / first paint): keep the exact 360x640 2D look.
        currentGameRect = null;
        currentStageWidth = 0;
        currentStageHeight = 0;
        engine.resize(WORLD_WIDTH, WORLD_HEIGHT, visibleDpr());
      }
    };

    const showSceneOnly = () => {
      glVisible = false;
      // Keep a metrics-only hook in QA modes so ?debug still reports frame
      // stats on the 2D fallback; the default build keeps afterRender unset.
      engine.afterRender = metricsEnabled ? recordFrame : undefined;
      engine.backgroundVisible = true;
      // The Canvas 2D renderer draws the badge again, so the DOM label must
      // never duplicate or replace it in fallback/Off mode.
      engine.ribbonLabelDom = false;
      hideRibbonLabel();
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
      currentGameRect = null;
      currentStageWidth = 0;
      currentStageHeight = 0;

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
      currentGameRect = gameRect;
      currentStageWidth = stageW;
      currentStageHeight = stageH;
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

      // GL owns the full-bleed background from the first composited frame, so
      // the 2D scene must be drawn without its own opaque background.
      engine.backgroundVisible = false;

      // engine.resize clears the 2D backing store. Populate it once before the
      // first controller.render or the first GL frame is background-only. This
      // is the render half of engine.frame(0) without the update tick, so a
      // resize can never advance gameplay (a zero-dt update still runs
      // collision checks and could collect a pearl).
      try {
        const sceneCtx = sceneCanvas.getContext('2d');
        if (!sceneCtx) {
          throw new Error('Scene canvas has no 2D context');
        }
        engine.render(sceneCtx, capture.width, capture.height, 1);
      } catch {
        enterFallback();
        return;
      }

      // Draw one GL frame *before* hiding the 2D scene. If the GPU path cannot
      // render, the user never sees a black/frozen stage and we fall back
      // while the populated Canvas 2D result is still on screen.
      const firstFrameSnapshot = engine.getSceneSnapshot();
      try {
        controller.render(firstFrameSnapshot);
      } catch {
        enterFallback();
        return;
      }

      glVisible = true;
      // GL now owns the badge: the next Canvas 2D capture keeps only the
      // dashed line and the DOM label supplies the text.
      engine.ribbonLabelDom = true;
      updateRibbonLabel(firstFrameSnapshot);
      engine.afterRender = renderAndRecord;
      if (!disposed) {
        setGlActive(true);
      }

      // Start the idle rAF loop so the start screen shows the animated
      // full-bleed background and idle fish before the first tap. This is
      // idempotent and only runs on the GL path; the 2D fallback keeps
      // today's start-screen behaviour. `?freeze` intentionally does not
      // start it so the fixture frame stays static for screenshots.
      if (!frozen) {
        engine.startLoop();
      }
    };

    /**
     * Builds a brand-new controller/backend. Used on the first mount and
     * whenever a failed init or render throw left no live controller. Returns
     * null after restoring the Canvas 2D scene and reporting Off.
     */
    const createController = (): PostFXController | null => {
      const factory = backendFactoryRef.current ?? defaultBackendFactory;
      let backend: PostFXBackend | null = null;
      try {
        backend = factory();
      } catch {
        backend = null;
      }

      if (!backend) {
        enterFallback();
        return null;
      }

      const next = new PostFXController(backend, { reducedMotion });
      controller = next;

      let initialised = false;
      try {
        initialised = next.init(fxCanvas, sceneCanvas);
      } catch {
        initialised = false;
      }

      if (!initialised) {
        available = false;
        enterFallback();
        return null;
      }

      available = true;
      return next;
    };

    /**
     * Reports the tier only after the resize/first frame has succeeded. A
     * failed switch reports Off through enterFallback and leaves `available`
     * false, so this never announces a GL tier that immediately disappears.
     */
    const reportAppliedTier = () => {
      if (!disposed && available && controller) {
        onEffectiveTierChangeRef.current?.(controller.tier);
      }
    };

    /**
     * The single mount/preference-switch entry point.
     * - With a live controller: setPreference in try/catch, then re-measure
     *   and resize. Off keeps the controller alive but hands the stage back to
     *   the exact Canvas 2D scene; Off→High therefore gets a viewport/FBO.
     * - Without one (failed init or a previous render throw): a GL tier runs a
     *   fresh init → setPreference → resize → first frame. Off only stays on
     *   the 2D scene, and any failure reports Off last.
     */
    const applyPreference = (pref: FxPreference) => {
      if (disposed) {
        return;
      }

      appliedPreferenceRef.current = pref;
      const isInitial = !hasApplied;
      hasApplied = true;

      if (controller) {
        try {
          controller.setPreference(pref, autoTier);
        } catch {
          enterFallback();
          return;
        }
        updateDimensions();
        reportAppliedTier();
        return;
      }

      const desiredTier = pref === 'auto' ? autoTier : pref;
      if (!isInitial && desiredTier === 'off') {
        // Off keeps the exact 2D path and does not pay for a new context.
        showSceneOnly();
        sizeFallback();
        onEffectiveTierChangeRef.current?.('off');
        return;
      }

      // The first mount always probes the backend, even for Off, so a live
      // controller is ready to reuse if the user later picks a GL tier.
      const next = createController();
      if (!next) {
        return;
      }

      try {
        next.setPreference(pref, autoTier);
      } catch {
        enterFallback();
        return;
      }

      updateDimensions();
      reportAppliedTier();
    };

    const handleResize = () => {
      updateDimensions();
      // The fallback has no rAF loop in non-GL mode; a frozen 2D fixture still
      // needs one repaint after the resize so the static frame is visible.
      renderFrozenFallback();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', handleResize);
    }

    applyPreferenceRef.current = applyPreference;
    applyPreference(fxPreferenceRef.current);
    renderFrozenFallback();

    return () => {
      disposed = true;
      glMountedRef.current = false;
      applyPreferenceRef.current = null;
      appliedPreferenceRef.current = null;

      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }

      available = false;
      engine.afterRender = undefined;
      engine.backgroundVisible = true;
      engine.ribbonLabelDom = false;

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

  // Preference changes after mount use the same applyPreference path as the
  // initial application, so a live controller is switched in place and a dead
  // one is recreated. The mount effect already applied the initial value.
  useEffect(() => {
    if (appliedPreferenceRef.current === fxPreference) {
      return;
    }
    applyPreferenceRef.current?.(fxPreference);
  }, [fxPreference]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // `?freeze` is a static inspection mode: no tap/key handler may unpause the
    // fixture or start a run, otherwise the frame would stop being reproducible.
    if (qaFlags.freeze) {
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
        // A focused button/radio/dialog owns the key; activating it must not
        // also start a run or flap behind the overlay.
        if (isInteractiveTarget(e.target)) {
          return;
        }
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
  }, [engine, qaFlags.freeze]);

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

      {/* Personal-best badge for the GL path; GameCanvas positions it via a
          ref in afterRender and hides it whenever the 2D fallback owns it. */}
      <RibbonLabel
        ref={ribbonLabelRef}
        x={0}
        y={0}
        target={0}
        visible={false}
      />
    </div>
  );
};
