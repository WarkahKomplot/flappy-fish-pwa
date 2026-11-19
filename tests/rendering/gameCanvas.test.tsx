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

  it('routes stage taps to the engine', () => {
    const spy = vi.spyOn(engine, 'handleInput');

    render(<GameCanvas engine={engine} backendFactory={() => null} />);

    fireEvent.pointerDown(screen.getByTestId('game-canvas'), {
      pointerType: 'mouse',
    });

    expect(spy).toHaveBeenCalled();
  });

  it('reveals the 2D scene if the GL frame throws', () => {
    mockMeasuredStage();

    const throwing = fakeBackendThatThrowsOnRender();
    render(<GameCanvas engine={engine} backendFactory={() => throwing} />);

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
});
