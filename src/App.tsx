import { useState, useEffect, useRef, useCallback } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { StartScreen } from './components/StartScreen';
import { GameOverModal } from './components/GameOverModal';
import { SkinSelector } from './components/SkinSelector';
import { FxPanel } from './components/FxPanel';
import { GameEngine } from './game/engine';
import {
  getHighScore,
  getLifetimePearls,
  getActiveSkin,
  setActiveSkin,
  isAudioMuted,
} from './game/storage';
import {
  loadFxPreference,
  parseFxOverride,
  resolveFxPreference,
  saveFxPreference,
} from './game/rendering/fxSettings';
import type { FxPreference, QualityTier } from './game/rendering/types';
import type { GameStatus, SkinId } from './game/types';

/**
 * Root Application:
 * Seamlessly orchestrates 60fps HTML5 Canvas game engine,
 * HUD overlay, start screen guide, instant retry Game Over modal,
 * and milestone skin wardrobe selector.
 *
 * NOTE: the legacy JerayaWara navigation app is intentionally no longer
 * imported here. Keeping it in the module graph pulled maplibre-gl (~784 KB)
 * and dexie into every game load. The legacy source still exists for its own
 * repo/branch but is not part of this bundle. See HANDOFF.md.
 */
export function App() {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => getHighScore());
  const [runPearls, setRunPearls] = useState<number>(0);
  const [lifetimePearls, setLifetimePearls] = useState<number>(() => getLifetimePearls());
  const [combo, setCombo] = useState<number>(0);
  const [hasShield, setHasShield] = useState<boolean>(false);
  const [isNewBest, setIsNewBest] = useState<boolean>(false);
  const [activeSkin, setActiveSkinState] = useState<SkinId>(() => getActiveSkin());
  const [isMuted, setIsMutedState] = useState<boolean>(() => isAudioMuted());
  const [isSkinModalOpen, setIsSkinModalOpen] = useState<boolean>(false);
  // URL `?fx=` wins for this session, then the persisted choice, then Auto.
  // Selecting an option in the panel saves it and updates this state.
  const [fxPreference, setFxPreference] = useState<FxPreference>(() =>
    resolveFxPreference(
      parseFxOverride(
        typeof window !== 'undefined' ? window.location.search : ''
      ),
      loadFxPreference()
    )
  );
  const [effectiveTier, setEffectiveTier] = useState<QualityTier>('off');
  const [isFxOpen, setIsFxOpen] = useState<boolean>(false);

  // Singleton GameEngine reference
  const engineRef = useRef<GameEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new GameEngine({
      activeSkin: getActiveSkin(),
      onScoreChange: (newScore) => {
        setScore(newScore);
      },
      onComboChange: (newCombo, shield) => {
        setCombo(newCombo);
        setHasShield(shield);
      },
      onGameOver: (finalScore, finalHigh, finalRunPearls, newBest) => {
        setStatus('gameover');
        setScore(finalScore);
        setHighScore(finalHigh);
        setRunPearls(finalRunPearls);
        setIsNewBest(newBest);
        setLifetimePearls(getLifetimePearls());
      },
    });
  }

  const engine = engineRef.current;

  // Clean up engine animation frames on unmount
  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, [engine]);

  // Primary tap handler for state transitions
  const handleTap = useCallback(() => {
    if (status === 'idle') {
      engine.start();
      setStatus('playing');
    } else if (status === 'gameover') {
      engine.start();
      setStatus('playing');
      setScore(0);
      setRunPearls(0);
      setCombo(0);
      setHasShield(false);
      setIsNewBest(false);
      setHighScore(getHighScore());
      setLifetimePearls(getLifetimePearls());
    }
  }, [engine, status]);

  // Pause / Resume toggle
  const handleTogglePause = useCallback(() => {
    engine.togglePause();
    setStatus(engine.status);
  }, [engine]);

  // Audio mute toggle
  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    engine.setMuted(nextMuted);
    setIsMutedState(nextMuted);
  }, [engine, isMuted]);

  // Skin selection & persistent equip
  const handleSelectSkin = useCallback(
    (skinId: SkinId) => {
      engine.setSkin(skinId);
      setActiveSkin(skinId);
      setActiveSkinState(skinId);
    },
    [engine]
  );

  // FX preference: persist first, then let GameCanvas apply the change. The
  // panel stays open so the resolved tier line can show the result.
  const handleSelectFx = useCallback((pref: FxPreference) => {
    saveFxPreference(pref);
    setFxPreference(pref);
  }, []);

  const handleOpenFx = useCallback(() => setIsFxOpen(true), []);
  const handleCloseFx = useCallback(() => setIsFxOpen(false), []);

  // Instant retry (<0.2s transition)
  const handleRetry = useCallback(() => {
    engine.start();
    setStatus('playing');
    setScore(0);
    setRunPearls(0);
    setCombo(0);
    setHasShield(false);
    setIsNewBest(false);
    setHighScore(getHighScore());
    setLifetimePearls(getLifetimePearls());
  }, [engine]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Mobile-proportioned portrait stage */}
      <main
        className="relative h-full w-full max-w-md overflow-hidden bg-slate-900 shadow-2xl flex flex-col"
        style={{ touchAction: 'none' }}
      >
        {/* 60fps Canvas 2D Engine Viewport (with the WebGL compositor canvas) */}
        <GameCanvas
          engine={engine}
          onTap={handleTap}
          fxPreference={fxPreference}
          onEffectiveTierChange={setEffectiveTier}
        />

        {/* In-Game HUD: Score, Pearl Combo, Shield, Pause, Mute */}
        <HUD
          score={score}
          combo={combo}
          hasShield={hasShield}
          isPaused={status === 'paused'}
          isMuted={isMuted}
          onTogglePause={handleTogglePause}
          onToggleMute={handleToggleMute}
          status={status}
          onOpenFx={handleOpenFx}
        />

        {/* Start Screen Overlay: Tap to Swim Guide & Wardrobe */}
        {status === 'idle' && (
          <StartScreen
            highScore={highScore}
            lifetimePearls={lifetimePearls}
            activeSkin={activeSkin}
            onOpenSkins={() => setIsSkinModalOpen(true)}
            onStart={handleTap}
            onOpenFx={handleOpenFx}
          />
        )}

        {/* Game Over Modal: High-score recap & Instant retry */}
        {status === 'gameover' && (
          <GameOverModal
            score={score}
            highScore={highScore}
            runPearls={runPearls}
            lifetimePearls={lifetimePearls}
            isNewHighScore={isNewBest}
            onRetry={handleRetry}
          />
        )}

        {/* Milestone Skin Wardrobe Modal */}
        <SkinSelector
          isOpen={isSkinModalOpen}
          onClose={() => setIsSkinModalOpen(false)}
          activeSkin={activeSkin}
          lifetimePearls={lifetimePearls}
          onSelectSkin={handleSelectSkin}
        />

        {/* Auto/High/Medium/Low/Off emergency quality switch. It is a single
            instance shared by the start screen and the pause overlay. */}
        <FxPanel
          isOpen={isFxOpen}
          preference={fxPreference}
          effectiveTier={effectiveTier}
          onSelect={handleSelectFx}
          onClose={handleCloseFx}
        />
      </main>
    </div>
  );
}

export default App;
