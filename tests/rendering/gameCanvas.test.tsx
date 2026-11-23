import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GameCanvas } from '../../src/components/GameCanvas';
import { GameEngine } from '../../src/game/engine';
import { createMockContext } from '../helpers/canvas';
import type { PostFXBackend } from '../../src/game/rendering/backend';
import type { SoundEffects } from '../../src/game/audio';

function createMockSoundEffects(): SoundEffects {
  return {
    playSwimFlap: vi.fn(),
    playPearlChime: vi.fn(),
    playShieldActivate: vi.fn(),
    playShieldPop: vi.fn(),
    playHit: vi.fn(),
    playPersonalBest: vi.fn(),
    resumeContext: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * A backend whose init succeeds by default. Pass overrides to make a named
 * method throw (the render-failure and resize-failure cases below).
 */
function fakeBackend(overrides: Partial<PostFXBackend> = {}): PostFXBackend {
  return {
    init: vi.fn(() => true),
    resize: vi.fn(),
    beginFrame: vi.fn(),
    background: vi.fn(),
    scene: vi.fn(),
    effects: vi.fn(),
    bloom: vi.fn(),
    composite: vi.fn(),
    endFrame: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function fakeBackendThatThrowsOnRender(): PostFXBackend {
  // Task 7 renders one frame before hiding the scene canvas; succeed on that
  // frame and throw on the next so this still exercises a mid-game failure.
  let frames = 0;
  return fakeBackend({
    beginFrame: vi.fn(() => {
      frames += 1;
      if (frames > 1) {
        throw new Error('gl render boom');
      }
    }),
  });
}

function fakeBackendThatThrowsOnResize(): PostFXBackend {
  return fakeBackend({
    resize: vi.fn(() => {
      throw new Error('gl resize boom');
    }),
  });
}

/**
 * jsdom reports a zero-sized stage, which Task 6 deliberately treats as
 * "unmeasured" (keep the 360x640 2D fallback). GL-path tests opt in to a
 * measured 390x844 stage by stubbing the stage container's rect.
 */
function mockMeasuredStage(width = 390, height = 844): void {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => rect,
  };
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
    rect as DOMRect
  );
}

/**
 * Auto resolves to High only on the desktop-pointer path in jsdom; stub
 * matchMedia so the adaptive test starts High and can step down to Medium.
 */
function mockDesktopPointer(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('hover: hover'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe('GameCanvas two-canvas structure and fallback', () => {
  let engine: GameEngine;
  let mockSounds: SoundEffects;
  let ctx2d: CanvasRenderingContext2D;

  beforeEach(() => {
    localStorage.clear();
    mockSounds = createMockSoundEffects();
    engine = new GameEngine({ soundEffects: mockSounds });
    ctx2d = createMockContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
      type: string
    ) => (type === '2d' ? ctx2d : null)) as any);
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the 2D scene and hides FX when WebGL2 is unavailable', () => {
    render(<GameCanvas engine={engine} backendFactory={() => null} />);

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
  });

  it('does not throw when getContext returns a 2D-shaped object for webgl2', () => {
    (HTMLCanvasElement.prototype.getContext as any).mockImplementation(
      (type: string) =>
        type === '2d' ? ctx2d : ({ createShader: undefined } as any)
    );

    expect(() => render(<GameCanvas engine={engine} />)).not.toThrow();

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  });

  it('routes stage taps to the single onTap dispatch', () => {
    const spy = vi.spyOn(engine, 'handleInput');
    const onTap = vi.fn();

    render(
      <GameCanvas engine={engine} onTap={onTap} backendFactory={() => null} />
    );

    fireEvent.pointerDown(screen.getByTestId('game-canvas'), {
      pointerType: 'mouse',
    });

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reveals the 2D scene if the GL frame throws', () => {
    mockMeasuredStage();

    const throwing = fakeBackendThatThrowsOnRender();
    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => throwing}
        onEffectiveTierChange={onTier}
      />
    );

    // The mount effect activates GL once the stage is measured and installs
    // afterRender.
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('0');

    // Drive one frame the same way the engine's rAF loop does.
    act(() => {
      engine.frame(1);
    });

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    expect(onTier).toHaveBeenLastCalledWith('off');
  });

  it('repaints the scene frame so the fallback never shows a blank stage', () => {
    mockMeasuredStage();

    const throwing = fakeBackendThatThrowsOnRender();
    render(<GameCanvas engine={engine} backendFactory={() => throwing} />);

    const renderSpy = vi.spyOn(engine, 'render');
    const resizeSpy = vi.spyOn(engine, 'resize');
    renderSpy.mockClear();
    resizeSpy.mockClear();

    act(() => {
      engine.frame(1);
    });

    // engine.resize() clears the canvas backing store; the fallback must
    // repaint afterwards or the player sees a blank stage until the next rAF.
    const lastResize = Math.max(0, ...resizeSpy.mock.invocationCallOrder);
    const lastRender = Math.max(0, ...renderSpy.mock.invocationCallOrder);
    expect(resizeSpy).toHaveBeenCalled();
    expect(lastRender).toBeGreaterThan(lastResize);
  });

  it('falls back to the 2D scene when the WebGL context is lost', () => {
    mockMeasuredStage();

    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => fakeBackend()}
        onEffectiveTierChange={onTier}
      />
    );
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('0');

    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => {
      screen.getByTestId('fx-canvas').dispatchEvent(lost);
    });

    // preventDefault lets the browser restore the context later, but the run
    // already continues on the exact 2D path.
    expect(lost.defaultPrevented).toBe(true);
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(onTier).toHaveBeenLastCalledWith('off');
  });

  it('falls back when the frame pipeline throws outside the controller guard', () => {
    mockMeasuredStage();

    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => fakeBackend()}
        onEffectiveTierChange={onTier}
      />
    );
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('0');

    // A throw outside controller.render (e.g. building the scene snapshot)
    // must not silently kill afterRender and freeze the GL canvas.
    vi.spyOn(engine, 'getSceneSnapshot').mockImplementation(() => {
      throw new Error('snapshot boom');
    });
    act(() => {
      engine.frame(1);
    });

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(onTier).toHaveBeenLastCalledWith('off');
  });

  it('reports Off and keeps the 2D scene when the preference is High but no backend exists', () => {
    const onTier = vi.fn();

    render(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={() => null}
        onEffectiveTierChange={onTier}
      />
    );

    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
  });

  it('falls back if controller.resize throws', () => {
    mockMeasuredStage();

    const throwing = fakeBackendThatThrowsOnResize();
    render(<GameCanvas engine={engine} backendFactory={() => throwing} />);

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    expect(throwing.dispose).toHaveBeenCalled();
  });

  it('hides the 2D scene, shows FX and sizes the capped capture buffer on success', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;

    expect(scene.style.opacity).toBe('0');
    expect(screen.getByTestId('fx-canvas').style.display).not.toBe('none');
    expect(engine.backgroundVisible).toBe(false);
    expect(engine.afterRender).toBeTypeOf('function');

    // High captureDpr 1.5 on a 390x693 game rect -> 585x1040 buffer.
    expect(scene.width).toBe(585);
    expect(scene.height).toBe(1040);

    // The fractional 75.5 origin must reach the backend unchanged.
    expect(backend.resize).toHaveBeenCalledWith(
      390,
      844,
      { x: 0, y: 75.5, width: 390, height: 693 },
      expect.objectContaining({ tier: 'high' })
    );
  });

  it('owns the ribbon label in the DOM only while GL is active', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    expect(engine.ribbonLabelDom).toBe(true);

    engine.highScore = 3;
    engine.ribbonTargetScore = 3;
    engine.ribbonX = 100;

    act(() => {
      engine.frame(1);
    });

    const label = screen.getByTestId('ribbon-label');
    expect(label.textContent).toContain('BEST: 3');
    expect(label.style.opacity).toBe('1');
    // worldToStage(100, 110, {x:0,y:75.5,w:390,h:693})
    expect(parseFloat(label.style.left)).toBeCloseTo(108.333, 2);
    expect(parseFloat(label.style.top)).toBeCloseTo(194.609, 2);
  });

  it('hides the DOM ribbon label and restores the Canvas 2D badge on fallback', () => {
    mockMeasuredStage();

    const throwing = fakeBackendThatThrowsOnRender();
    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => throwing} />
    );

    expect(engine.ribbonLabelDom).toBe(true);
    expect(screen.getByTestId('ribbon-label')).toBeDefined();

    act(() => {
      engine.frame(1);
    });

    expect(engine.ribbonLabelDom).toBe(false);
    expect(screen.getByTestId('ribbon-label').style.opacity).toBe('0');
  });

  it('keeps the 2D scene when the preference is Off even with a usable backend', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    // The controller stays initialised so a later preference switch can reuse it.
    expect(backend.dispose).not.toHaveBeenCalled();
  });

  it('keeps the 2D fallback at 360x640 while the stage is unmeasured', () => {
    const backend = fakeBackend();
    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;

    expect(scene.style.opacity).toBe('1');
    expect(scene.width).toBe(360);
    expect(scene.height).toBe(640);
    expect(backend.resize).not.toHaveBeenCalled();
  });

  it('falls back when a non-null backend fails to initialise', () => {
    const onTier = vi.fn();
    const backend = fakeBackend({ init: vi.fn(() => false) });

    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(backend.dispose).toHaveBeenCalled();
  });

  it('caps the scene capture buffer on a large measured stage', () => {
    mockMeasuredStage(1200, 2000);

    const backend = fakeBackend();
    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;

    // 1125x2000 at captureDpr 1.5 would be 5.06 MP; MAX_CAPTURE_PIXELS caps it.
    expect(scene.width * scene.height).toBeLessThanOrEqual(1_500_000);
    expect(scene.width).toBe(918);
    expect(scene.height).toBe(1632);
  });

  it('renders one first frame before hiding the scene and starts the idle loop', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    const startLoop = vi.spyOn(engine, 'startLoop');

    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    expect(backend.beginFrame).toHaveBeenCalledTimes(1);
    expect(backend.background).toHaveBeenCalledTimes(1);
    expect(backend.scene).toHaveBeenCalledTimes(1);
    expect(backend.composite).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('0');
    expect(startLoop).toHaveBeenCalled();
  });

  it('populates the 2D scene before the first GL pass on mount and after a resize', () => {
    let triggerResize: (() => void) | null = null;
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    mockMeasuredStage();

    const backend = fakeBackend();
    const events: string[] = [];
    const captureVisibility: boolean[] = [];

    const beginFrame = backend.beginFrame.bind(backend);
    backend.beginFrame = vi.fn(
      (...args: Parameters<PostFXBackend['beginFrame']>) => {
        events.push('beginFrame');
        beginFrame(...args);
      }
    );
    const composite = backend.composite.bind(backend);
    backend.composite = vi.fn(
      (...args: Parameters<PostFXBackend['composite']>) => {
        events.push('composite');
        composite(...args);
      }
    );

    const originalRender = engine.render.bind(engine);
    vi.spyOn(engine, 'render').mockImplementation((ctx, width, height, dpr) => {
      events.push('render');
      captureVisibility.push(engine.backgroundVisible);
      originalRender(ctx, width, height, dpr);
    });
    // The capture must be the render half only; engine.frame(0) would tick
    // update() and show up here even though dt is zero.
    const updateSpy = vi.spyOn(engine, 'update');
    const gameTimeBefore = engine.gameTime;

    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    expect(events.slice(0, 3)).toEqual(['render', 'beginFrame', 'composite']);
    expect(captureVisibility[0]).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(engine.gameTime).toBe(gameTimeBefore);
    expect(engine.backgroundVisible).toBe(false);
    expect(triggerResize).not.toBeNull();

    events.length = 0;
    act(() => {
      triggerResize?.();
    });

    expect(events.slice(0, 3)).toEqual(['render', 'beginFrame', 'composite']);
    expect(captureVisibility[captureVisibility.length - 1]).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(engine.gameTime).toBe(gameTimeBefore);
    expect(backend.beginFrame).toHaveBeenCalledTimes(2);
    expect(engine.backgroundVisible).toBe(false);
  });

  it('restores the 2D background if the first-frame scene capture throws', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    vi.spyOn(engine, 'render').mockImplementationOnce(() => {
      throw new Error('2d capture boom');
    });

    render(
      <GameCanvas engine={engine} fxPreference="high" backendFactory={() => backend} />
    );

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    expect(backend.beginFrame).not.toHaveBeenCalled();
    expect(backend.dispose).toHaveBeenCalled();
  });

  it('does not start the idle loop in the 2D fallback', () => {
    const startLoop = vi.spyOn(engine, 'startLoop');

    render(<GameCanvas engine={engine} backendFactory={() => null} />);

    expect(startLoop).not.toHaveBeenCalled();
  });

  it('falls back before hiding the scene when the first GL frame throws', () => {
    mockMeasuredStage();

    const backend = fakeBackend({
      beginFrame: vi.fn(() => {
        throw new Error('first frame boom');
      }),
    });
    const startLoop = vi.spyOn(engine, 'startLoop');

    render(<GameCanvas engine={engine} backendFactory={() => backend} />);

    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(backend.dispose).toHaveBeenCalled();
    expect(startLoop).not.toHaveBeenCalled();
  });

  it('re-measures and resizes an initialised controller when switching Off to High', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    const factory = vi.fn(() => backend);
    const onTier = vi.fn();
    const { rerender } = render(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    // Off still brings up the controller so a later switch can reuse it.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(backend.init).toHaveBeenCalledTimes(1);
    expect(backend.dispose).not.toHaveBeenCalled();
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(onTier).toHaveBeenLastCalledWith('off');

    rerender(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    // The live controller is reused: no second backend and no second init.
    expect(factory).toHaveBeenCalledTimes(1);
    expect(backend.init).toHaveBeenCalledTimes(1);
    expect(backend.dispose).not.toHaveBeenCalled();

    // Re-measured and resized, so the backend gets a viewport and FBOs.
    expect(backend.resize).toHaveBeenCalledWith(
      390,
      844,
      { x: 0, y: 75.5, width: 390, height: 693 },
      expect.objectContaining({ tier: 'high' })
    );
    expect(onTier).toHaveBeenLastCalledWith('high');
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('0');
    expect(screen.getByTestId('fx-canvas').style.display).not.toBe('none');
    expect(engine.backgroundVisible).toBe(false);
    expect(engine.afterRender).toBeTypeOf('function');

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;
    expect(scene.width).toBe(585);
    expect(scene.height).toBe(1040);
  });

  it('attempts a fresh init when selecting High after a failed init', () => {
    mockMeasuredStage();

    const first = fakeBackend({ init: vi.fn(() => false) });
    const second = fakeBackend({ init: vi.fn(() => false) });
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onTier = vi.fn();

    const { rerender } = render(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(onTier).toHaveBeenLastCalledWith('off');

    rerender(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    // The dead controller was replaced by a brand-new backend attempt.
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalled();
    expect(second.init).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalled();

    // The fresh init failed too: exact 2D scene, never a GL tier on screen.
    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
  });

  it('shows GL after a successful fresh init that follows a failed init', () => {
    mockMeasuredStage();

    const first = fakeBackend({ init: vi.fn(() => false) });
    const second = fakeBackend();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onTier = vi.fn();

    const { rerender } = render(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(onTier).toHaveBeenLastCalledWith('off');

    rerender(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={factory}
        onEffectiveTierChange={onTier}
      />
    );

    // A brand-new controller/backend was built and this time it came up.
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second.init).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    expect(onTier).toHaveBeenLastCalledWith('high');
    expect(second.resize).toHaveBeenCalledWith(
      390,
      844,
      { x: 0, y: 75.5, width: 390, height: 693 },
      expect.objectContaining({ tier: 'high' })
    );

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;
    expect(scene.style.opacity).toBe('0');
    expect(screen.getByTestId('fx-canvas').style.display).not.toBe('none');
    expect(engine.backgroundVisible).toBe(false);
    expect(engine.afterRender).toBeTypeOf('function');
    expect(scene.width).toBe(585);
    expect(scene.height).toBe(1040);
  });

  it('returns to the exact 2D scene at the visible DPR when switching High to Off', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    const onTier = vi.fn();
    const { rerender } = render(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    const scene = screen.getByTestId('game-canvas') as HTMLCanvasElement;
    expect(onTier).toHaveBeenLastCalledWith('high');
    expect(scene.width).toBe(585);

    rerender(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    expect(onTier).toHaveBeenLastCalledWith('off');
    expect(scene.style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();

    // Back at the visible DPR and game rect, not the capture buffer.
    expect(scene.width).toBe(390);
    expect(scene.height).toBe(693);

    // Off keeps the controller alive for a later switch.
    expect(backend.dispose).not.toHaveBeenCalled();
  });

  it('ends on Off when switching from Off to High fails', () => {
    mockMeasuredStage();

    const backend = fakeBackendThatThrowsOnResize();
    const onTier = vi.fn();

    const { rerender } = render(
      <GameCanvas
        engine={engine}
        fxPreference="off"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    expect(onTier).toHaveBeenLastCalledWith('off');

    rerender(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    // The failed resize never announces High; the final effective state and
    // the visible canvas both stay on Off / Canvas 2D.
    const tiers = onTier.mock.calls.map(([tier]) => tier);
    expect(tiers[tiers.length - 1]).toBe('off');
    expect(tiers).not.toContain('high');
    expect(screen.getByTestId('game-canvas').style.opacity).toBe('1');
    expect(screen.getByTestId('fx-canvas').style.display).toBe('none');
    expect(engine.backgroundVisible).toBe(true);
    expect(engine.afterRender).toBeUndefined();
    expect(backend.dispose).toHaveBeenCalled();
  });

  it('drops one Auto tier after 5 s over 20 ms, never upgrades, and re-evaluates on retry', async () => {
    mockDesktopPointer();
    mockMeasuredStage();

    const backend = fakeBackend();
    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    expect(onTier).toHaveBeenLastCalledWith('high');

    let now = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    // The downgrade is applied outside the frame callback (as a microtask),
    // so each drive block is awaited before its tier assertion.
    const driveFrames = async (count: number) => {
      await act(async () => {
        for (let i = 0; i < count; i += 1) {
          now += 25;
          engine.afterRender?.(engine.getSceneSnapshot());
        }
      });
    };

    engine.status = 'playing';
    // 201 calls: the first stamps the clock, the remaining 200 × 25 ms fill
    // the 5 s adaptive window at a p95 well over the 20 ms threshold.
    await driveFrames(201);
    expect(onTier).toHaveBeenLastCalledWith('medium');

    // One downgrade per run: another slow window must not reach Low.
    await driveFrames(201);
    expect(onTier).toHaveBeenLastCalledWith('medium');
    expect(onTier.mock.calls.map(([tier]) => tier)).toEqual(['high', 'medium']);

    // Pausing and resuming is the same run and must not re-arm the budget.
    engine.status = 'paused';
    await driveFrames(1);
    engine.status = 'playing';
    await driveFrames(201);
    expect(onTier.mock.calls.map(([tier]) => tier)).toEqual(['high', 'medium']);

    // Retry re-arms the one-downgrade budget for the next run.
    engine.status = 'idle';
    await driveFrames(1);
    engine.status = 'playing';
    await driveFrames(201);
    expect(onTier).toHaveBeenLastCalledWith('low');

    // Never auto-upgrade, and no oscillation after the run's one downgrade.
    await driveFrames(201);
    expect(onTier.mock.calls.map(([tier]) => tier)).toEqual([
      'high',
      'medium',
      'low',
    ]);
    nowSpy.mockRestore();
  });

  it('defers the auto-downgrade out of the frame callback', async () => {
    mockDesktopPointer();
    mockMeasuredStage();

    const backend = fakeBackend();
    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );
    expect(onTier).toHaveBeenLastCalledWith('high');

    let now = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    engine.status = 'playing';

    await act(async () => {
      // 200 calls: the first stamps the clock, the remaining 199 x 25 ms
      // leave the adaptive window just under the 5 s mark.
      for (let i = 0; i < 200; i += 1) {
        now += 25;
        engine.afterRender?.(engine.getSceneSnapshot());
      }
      const resizesBefore = vi.mocked(backend.resize).mock.calls.length;

      // The crossing frame must only schedule the downgrade: no FBO churn and
      // no re-render inside the frame callback itself.
      now += 25;
      engine.afterRender?.(engine.getSceneSnapshot());
      expect(vi.mocked(backend.resize).mock.calls.length).toBe(resizesBefore);
      expect(onTier).toHaveBeenLastCalledWith('high');
    });

    // The deferred downgrade applies once the frame callback has returned.
    expect(onTier).toHaveBeenLastCalledWith('medium');
    nowSpy.mockRestore();
  });

  it('does not adapt a manual tier', () => {
    mockDesktopPointer();
    mockMeasuredStage();

    const backend = fakeBackend();
    const onTier = vi.fn();
    render(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={() => backend}
        onEffectiveTierChange={onTier}
      />
    );

    let now = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    engine.status = 'playing';

    act(() => {
      for (let i = 0; i < 401; i += 1) {
        now += 40;
        engine.afterRender?.(engine.getSceneSnapshot());
      }
    });

    expect(onTier.mock.calls.map(([tier]) => tier)).toEqual(['high']);
    nowSpy.mockRestore();
  });

  it('logs p50/p95 on run end when ?benchmark=1 is set', () => {
    mockMeasuredStage();

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const backend = fakeBackend();
    render(
      <GameCanvas
        engine={engine}
        fxPreference="high"
        backendFactory={() => backend}
        qaFlags={{ debug: false, benchmark: true, freeze: false }}
      />
    );

    let now = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    engine.status = 'playing';

    act(() => {
      for (let i = 0; i < 30; i += 1) {
        now += 16;
        engine.afterRender?.(engine.getSceneSnapshot());
      }
      engine.status = 'gameover';
      now += 16;
      engine.afterRender?.(engine.getSceneSnapshot());
    });

    const benchmarkLine = log.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('[flappy-fish benchmark]'));

    expect(benchmarkLine).toBeDefined();
    expect(benchmarkLine).toContain('p50=');
    expect(benchmarkLine).toContain('p95=');
    expect(benchmarkLine).toContain('tier=high');
    expect(benchmarkLine).toContain('capture=585x1040');
    nowSpy.mockRestore();
  });

  it('applies the deterministic fixture and skips the loop and input under ?freeze', () => {
    mockMeasuredStage();

    const backend = fakeBackend();
    const startLoop = vi.spyOn(engine, 'startLoop');
    render(
      <GameCanvas
        engine={engine}
        backendFactory={() => backend}
        qaFlags={{
          debug: false,
          benchmark: false,
          freeze: true,
          seed: 7,
          time: 2,
        }}
      />
    );

    expect(engine.status).toBe('paused');
    expect(engine.gameTime).toBe(2);
    expect(engine.fish.x).toBe(80);
    expect(engine.fish.y).toBe(300);
    expect(engine.obstacles.map((obs) => obs.x)).toEqual([180, 380, 580]);
    expect(startLoop).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('game-canvas'), {
      pointerType: 'mouse',
    });
    expect(engine.status).toBe('paused');
  });
});
