import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HUD } from '../src/components/HUD';
import { StartScreen } from '../src/components/StartScreen';
import { GameOverModal } from '../src/components/GameOverModal';
import { SkinSelector } from '../src/components/SkinSelector';
import { GameCanvas } from '../src/components/GameCanvas';
import { App } from '../src/App';
import { GameEngine } from '../src/game/engine';
import { isAudioMuted } from '../src/game/storage';

describe('Flappy Fish UI Overlays & HUD Tests', () => {
  beforeAll(() => {
    const ctx2d = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    };
    // A `webgl2` probe must fail cleanly: the real backend does not exist
    // until Task 7, and returning a 2D-shaped object for every context type
    // would make the two-canvas fallback look usable when it is not.
    HTMLCanvasElement.prototype.getContext = vi.fn((type: string) =>
      type === '2d' ? ctx2d : null
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('HUD Component', () => {
    it('renders current score and combo meter dots', () => {
      const onTogglePause = vi.fn();
      const onToggleMute = vi.fn();

      const { rerender } = render(
        <HUD
          score={42}
          combo={0}
          hasShield={false}
          isPaused={false}
          isMuted={false}
          onTogglePause={onTogglePause}
          onToggleMute={onToggleMute}
          status="playing"
        />
      );

      // Score
      expect(screen.getByTestId('hud-score').textContent).toBe('42');

      // Combo dots (0 active)
      const dot0 = screen.getByTestId('combo-dot-0');
      const dot1 = screen.getByTestId('combo-dot-1');
      const dot2 = screen.getByTestId('combo-dot-2');
      expect(dot0.getAttribute('data-active')).toBe('false');
      expect(dot1.getAttribute('data-active')).toBe('false');
      expect(dot2.getAttribute('data-active')).toBe('false');

      // Shield badge should NOT be rendered when hasShield is false
      expect(screen.queryByTestId('shield-badge')).toBeNull();

      // Rerender with combo=2
      rerender(
        <HUD
          score={42}
          combo={2}
          hasShield={false}
          isPaused={false}
          isMuted={false}
          onTogglePause={onTogglePause}
          onToggleMute={onToggleMute}
          status="playing"
        />
      );

      expect(dot0.getAttribute('data-active')).toBe('true');
      expect(dot1.getAttribute('data-active')).toBe('true');
      expect(dot2.getAttribute('data-active')).toBe('false');
    });

    it('renders pulsing cyan shield badge when hasShield is true', () => {
      render(
        <HUD
          score={10}
          combo={0}
          hasShield={true}
          isPaused={false}
          isMuted={false}
          onTogglePause={vi.fn()}
          onToggleMute={vi.fn()}
          status="playing"
        />
      );

      const shieldBadge = screen.getByTestId('shield-badge');
      expect(shieldBadge).toBeDefined();
      expect(shieldBadge.textContent).toContain('SHIELD ACTIVE');
    });

    it('toggles pause and mute callbacks when buttons are clicked', () => {
      const onTogglePause = vi.fn();
      const onToggleMute = vi.fn();

      render(
        <HUD
          score={5}
          combo={1}
          hasShield={false}
          isPaused={false}
          isMuted={false}
          onTogglePause={onTogglePause}
          onToggleMute={onToggleMute}
          status="playing"
        />
      );

      const pauseBtn = screen.getByTestId('pause-button');
      fireEvent.click(pauseBtn);
      expect(onTogglePause).toHaveBeenCalledTimes(1);

      const muteBtn = screen.getByTestId('mute-button');
      fireEvent.click(muteBtn);
      expect(onToggleMute).toHaveBeenCalledTimes(1);
    });

    it('shows the FX control only while paused and calls onOpenFx', () => {
      const onOpenFx = vi.fn();
      const { rerender } = render(
        <HUD
          score={5}
          combo={0}
          hasShield={false}
          isPaused={false}
          isMuted={false}
          onTogglePause={vi.fn()}
          onToggleMute={vi.fn()}
          status="playing"
          onOpenFx={onOpenFx}
        />
      );

      expect(screen.queryByTestId('fx-open-button')).toBeNull();

      rerender(
        <HUD
          score={5}
          combo={0}
          hasShield={false}
          isPaused={true}
          isMuted={false}
          onTogglePause={vi.fn()}
          onToggleMute={vi.fn()}
          status="paused"
          onOpenFx={onOpenFx}
        />
      );

      fireEvent.click(screen.getByTestId('fx-open-button'));
      expect(onOpenFx).toHaveBeenCalledTimes(1);
    });
  });

  describe('StartScreen Component', () => {
    it('renders title, "Tap to Swim" guide, current skin badge, and opens skins modal', () => {
      const onOpenSkins = vi.fn();

      render(
        <StartScreen
          highScore={15}
          lifetimePearls={75}
          activeSkin="neon-tetra"
          onOpenSkins={onOpenSkins}
        />
      );

      expect(screen.getByTestId('game-title').textContent).toContain('Flappy Fish');
      expect(screen.getByTestId('tap-guide').textContent).toMatch(/Tap to Swim/i);
      expect(screen.getByTestId('current-skin-badge').textContent).toContain('Neon Tetra');

      const skinsBtn = screen.getByTestId('skins-button');
      fireEvent.click(skinsBtn);
      expect(onOpenSkins).toHaveBeenCalledTimes(1);
    });

    it('opens the FX control without starting the game', () => {
      const onStart = vi.fn();
      const onOpenFx = vi.fn();

      render(
        <StartScreen
          highScore={15}
          lifetimePearls={75}
          activeSkin="neon-tetra"
          onOpenSkins={vi.fn()}
          onStart={onStart}
          onOpenFx={onOpenFx}
        />
      );

      fireEvent.click(screen.getByTestId('fx-open-button'));
      expect(onOpenFx).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('GameOverModal Component', () => {
    it('displays final score, high score, run pearls, and invokes onRetry instantly on tap', () => {
      const onRetry = vi.fn();

      render(
        <GameOverModal
          score={18}
          highScore={25}
          runPearls={4}
          lifetimePearls={80}
          onRetry={onRetry}
        />
      );

      expect(screen.getByTestId('game-over-score').textContent).toBe('18');
      expect(screen.getByTestId('game-over-high-score').textContent).toBe('25');
      expect(screen.getByTestId('game-over-run-pearls').textContent).toBe('4');
      expect(screen.getByTestId('game-over-lifetime-pearls').textContent).toBe('80');

      // Click retry
      const retryBtn = screen.getByTestId('retry-button');
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);

      // Tap on backdrop/modal also triggers instant retry (<0.2s transition)
      const modal = screen.getByTestId('game-over-modal');
      fireEvent.click(modal);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('does not celebrate a tie as a new best', () => {
      const { rerender } = render(
        <GameOverModal
          score={5}
          highScore={5}
          runPearls={0}
          lifetimePearls={10}
          onRetry={vi.fn()}
        />
      );

      // score === highScore is a tie, not a new record
      expect(screen.queryByText(/NEW BEST/i)).toBeNull();

      rerender(
        <GameOverModal
          score={6}
          highScore={6}
          runPearls={0}
          lifetimePearls={10}
          isNewHighScore={true}
          onRetry={vi.fn()}
        />
      );

      expect(screen.getByText(/NEW BEST/i)).toBeDefined();
    });
  });

  describe('SkinSelector Component', () => {
    it('shows locked and unlocked skin milestones based on lifetime pearl balance', () => {
      const onSelectSkin = vi.fn();
      const onClose = vi.fn();

      // At 20 lifetime pearls: Neon Tetra (0) unlocked, Clownfish (50) locked, Golden Manta (150) locked
      const { rerender } = render(
        <SkinSelector
          isOpen={true}
          onClose={onClose}
          activeSkin="neon-tetra"
          lifetimePearls={20}
          onSelectSkin={onSelectSkin}
        />
      );

      expect(screen.getByTestId('skin-equipped-neon-tetra')).toBeDefined();
      expect(screen.getByTestId('skin-locked-clownfish')).toBeDefined();
      expect(screen.getByTestId('skin-locked-golden-manta')).toBeDefined();

      // At 60 lifetime pearls: Clownfish is unlocked!
      rerender(
        <SkinSelector
          isOpen={true}
          onClose={onClose}
          activeSkin="neon-tetra"
          lifetimePearls={60}
          onSelectSkin={onSelectSkin}
        />
      );

      const equipClownfishBtn = screen.getByTestId('skin-equip-clownfish');
      expect(equipClownfishBtn).toBeDefined();
      fireEvent.click(equipClownfishBtn);
      expect(onSelectSkin).toHaveBeenCalledWith('clownfish');

      // Golden manta is still locked
      expect(screen.getByTestId('skin-locked-golden-manta')).toBeDefined();

      // At 160 lifetime pearls: Golden Manta is also unlocked
      rerender(
        <SkinSelector
          isOpen={true}
          onClose={onClose}
          activeSkin="clownfish"
          lifetimePearls={160}
          onSelectSkin={onSelectSkin}
        />
      );

      const equipMantaBtn = screen.getByTestId('skin-equip-golden-manta');
      expect(equipMantaBtn).toBeDefined();
      fireEvent.click(equipMantaBtn);
      expect(onSelectSkin).toHaveBeenCalledWith('golden-manta');
    });

    it('closes modal when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <SkinSelector
          isOpen={true}
          onClose={onClose}
          activeSkin="neon-tetra"
          lifetimePearls={0}
          onSelectSkin={vi.fn()}
        />
      );

      const closeBtn = screen.getByTestId('close-skins-modal');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('GameCanvas Component', () => {
    it('attaches touchstart and pointerdown with preventDefault to eliminate tap lag', () => {
      const engine = new GameEngine();
      const handleInputSpy = vi.spyOn(engine, 'handleInput');

      render(<GameCanvas engine={engine} />);

      const canvas = screen.getByTestId('game-canvas');
      expect(canvas).toBeDefined();

      // Dispatch touchstart event with cancelable: true
      const touchEvent = new Event('touchstart', { cancelable: true, bubbles: true });
      canvas.dispatchEvent(touchEvent);

      expect(touchEvent.defaultPrevented).toBe(true);
      expect(handleInputSpy).toHaveBeenCalled();

      // Dispatch mouse pointerdown
      const pointerEvent = new Event('pointerdown', { cancelable: true, bubbles: true });
      Object.defineProperty(pointerEvent, 'pointerType', { value: 'mouse' });
      canvas.dispatchEvent(pointerEvent);

      expect(pointerEvent.defaultPrevented).toBe(true);
      expect(handleInputSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('App Integration', () => {
    it('manages full game flow: idle start -> tap to swim -> mute toggle -> skin equip', () => {
      render(<App />);

      // Initially on StartScreen
      expect(screen.getByTestId('start-screen')).toBeDefined();
      expect(screen.getByTestId('game-title').textContent).toContain('Flappy Fish');

      // Mute toggle toggles audio and localStorage
      expect(isAudioMuted()).toBe(false);
      const muteBtn = screen.getByTestId('mute-button');
      fireEvent.click(muteBtn);
      expect(isAudioMuted()).toBe(true);

      // Open skin selector modal
      const skinsBtn = screen.getByTestId('skins-button');
      fireEvent.click(skinsBtn);

      expect(screen.getByTestId('skin-selector-modal')).toBeDefined();
      const closeBtn = screen.getByTestId('close-skins-modal');
      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('skin-selector-modal')).toBeNull();
    });

    it('opens the FX panel from the start screen without starting a run', () => {
      render(<App />);

      fireEvent.click(screen.getByTestId('fx-open-button'));

      expect(screen.getByTestId('fx-panel')).toBeDefined();
      expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Off');
      // The game stays on the start screen; opening FX is not a tap-to-start.
      expect(screen.getByTestId('start-screen')).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('fx-panel')).toBeNull();
      expect(screen.getByTestId('start-screen')).toBeDefined();
    });

    it('persists the selected Off preference and restores it on a new session', () => {
      const first = render(<App />);

      fireEvent.click(screen.getByTestId('fx-open-button'));
      fireEvent.click(screen.getByTestId('fx-option-off'));

      expect(localStorage.getItem('flappy_fish_fx')).toBe('off');
      expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe('true');

      first.unmount();

      render(<App />);
      fireEvent.click(screen.getByTestId('fx-open-button'));

      expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe('true');
    });

    it('reverts a failed GL switch to Off, persists Off and explains it', () => {
      render(<App />);

      fireEvent.click(screen.getByTestId('fx-open-button'));
      expect(screen.queryByTestId('fx-failure-message')).toBeNull();

      fireEvent.click(screen.getByTestId('fx-option-high'));

      // The failed switch must not remain the stored/selected choice.
      expect(localStorage.getItem('flappy_fish_fx')).toBe('off');
      expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('fx-option-high').getAttribute('aria-checked')).toBe('false');
      expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Off');
      expect(screen.getByTestId('fx-failure-message').textContent).toContain(
        'switched to Off'
      );
    });

    it('does not show a failure message for a legitimate Auto · Off', () => {
      render(<App />);

      fireEvent.click(screen.getByTestId('fx-open-button'));

      expect(screen.getByTestId('fx-option-auto').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Off');
      expect(screen.queryByTestId('fx-failure-message')).toBeNull();
    });

    it('retries a fresh init when High is selected again after the revert', () => {
      const getContext = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<
        typeof vi.fn
      >;

      render(<App />);
      fireEvent.click(screen.getByTestId('fx-open-button'));
      fireEvent.click(screen.getByTestId('fx-option-high'));

      expect(localStorage.getItem('flappy_fish_fx')).toBe('off');

      getContext.mockClear();
      fireEvent.click(screen.getByTestId('fx-option-high'));

      // A new backend/init was attempted even though the preference had been
      // reverted, and it failed again, so the final state is still Off.
      const webglCalls = getContext.mock.calls.filter(
        ([contextType]) => contextType === 'webgl2'
      );
      expect(webglCalls).toHaveLength(1);
      expect(localStorage.getItem('flappy_fish_fx')).toBe('off');
      expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('fx-failure-message')).toBeDefined();
    });

    it('does not start a run when Space is pressed on a start-screen control', () => {
      render(<App />);

      fireEvent.keyDown(screen.getByTestId('fx-open-button'), {
        key: ' ',
        code: 'Space',
      });

      expect(screen.getByTestId('start-screen')).toBeDefined();
      expect(screen.queryByTestId('hud-score')).toBeNull();
    });

    it('selects a panel radio with Space without starting a run', () => {
      render(<App />);

      fireEvent.click(screen.getByTestId('fx-open-button'));
      fireEvent.keyDown(screen.getByTestId('fx-option-low'), {
        key: ' ',
        code: 'Space',
      });

      // The radio activated (the failed GL switch reverted to Off), but the
      // window-level Space tap handler never started/flapped the game.
      expect(screen.getByTestId('fx-failure-message')).toBeDefined();
      expect(screen.getByTestId('start-screen')).toBeDefined();
      expect(screen.queryByTestId('hud-score')).toBeNull();
    });
  });
});
