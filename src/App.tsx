import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { DebugOverlay, EMPTY_DEBUG_METRICS, type DebugMetrics } from './components/DebugOverlay';
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
import { parseQaFlags } from './game/rendering/qa';
import type { FxPreference, QualityTier } from './game/rendering/types';
import type { GameStatus, SkinId } from './game/types';

type ExplicitGlTier = Exclude<QualityTier, 'off'>;

function isExplicitGlTier(pref: FxPreference): pref is ExplicitGlTier {
  return pref === 'high' || pref === 'medium' || pref === 'low';
}

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
  // §7.10: an explicit GL choice that cannot run reverts to Off with a short
  // inline message. Auto·Off is legitimate and stays silent.
  const [fxFailureMessage, setFxFailureMessage] = useState<string | null>(null);
  // QA switches are read once from the URL; an ordinary load is all-off, so
  // none of the debug/benchmark/freeze code paths run in production.
  const qaFlags = useMemo(
    () =>
      parseQaFlags(
        typeof window !== 'undefined' ? window.location.search : ''
      ),
    []
  );
  const debugMetricsRef = useRef<DebugMetrics>({ ...EMPTY_DEBUG_METRICS });
  const pendingFxSelectionRef = useRef<ExplicitGlTier | null>(
    isExplicitGlTier(fxPreference) ? fxPreference : null
  );
  const fxPreferenceRef = useRef<FxPreference>(fxPreference);

  // Lazy singleton: the initializer runs once when the state is created, not
  // in a render body (and never again on re-renders).
  const [engine] = useState(
    () =>
      new GameEngine({
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
      })
  );

  // Clean up engine animation frames on unmount
  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, [engine]);

  // Single input dispatch. Every gesture (stage tap, key, overlay tap) reaches
  // the engine exactly once — the engine owns the idle->start / flap /
  // game-over->restart transition — and React state is then synced from it.
  const handleGameInput = useCallback(() => {
    engine.handleInput();
    setStatus(engine.status);
    setScore(engine.score);
    setRunPearls(engine.runPearls);
    setCombo(engine.comboManager.combo);
    setHasShield(engine.comboManager.hasShield);
    setIsNewBest(engine.isNewBest);
    setHighScore(engine.highScore);
    setLifetimePearls(getLifetimePearls());
  }, [engine]);

  // Auto-pause when the page hides: browsers throttle rAF while hidden, so a
  // run left playing would advance (and kill the fish) while the player is away.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        engine.pause();
        setStatus(engine.status);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [engine]);

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

  // FX preference: persist the visible choice, then let GameCanvas apply it.
  // A manual GL choice is "pending" until GameCanvas reports a tier after a
  // successful resize/first frame; an Off report reverts and explains why.
  const handleSelectFx = useCallback(
    (pref: FxPreference) => {
      saveFxPreference(pref);
      // Sync the ref immediately: GameCanvas reports the applied tier from a
      // child effect that runs before the ref-sync effect below, so a delayed
      // ref makes a manual Off look like a mid-run failure.
      fxPreferenceRef.current = pref;
      setFxPreference(pref);
      setFxFailureMessage(null);
      // Re-selecting the current value is a React no-op and never reaches
      // GameCanvas, so it must not arm a failure revert.
      pendingFxSelectionRef.current =
        pref !== fxPreference && isExplicitGlTier(pref) ? pref : null;
    },
    [fxPreference]
  );

  const handleEffectiveTierChange = useCallback((tier: QualityTier) => {
    setEffectiveTier(tier);

    if (tier !== 'off') {
      pendingFxSelectionRef.current = null;
      return;
    }

    const pending = pendingFxSelectionRef.current;
    pendingFxSelectionRef.current = null;
    // A final Off means either a selected GL tier failed to start or a live
    // GL path stopped mid-run. Both revert/persist Off and explain; a
    // failed selection is not left "High · Off" with no recovery.
    if (!pending && !isExplicitGlTier(fxPreferenceRef.current)) {
      return;
    }

    saveFxPreference('off');
    fxPreferenceRef.current = 'off';
    setFxPreference('off');
    setFxFailureMessage('Effects unavailable — switched to Off');
  }, []);

  const handleOpenFx = useCallback(() => setIsFxOpen(true), []);
  const handleCloseFx = useCallback(() => {
    setIsFxOpen(false);
    setFxFailureMessage(null);
  }, []);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 overflow-hidden font-sans select-none"
      // 100dvh is exact under iOS Safari's dynamic toolbar; browsers that
      // cannot parse it drop the inline height and keep the h-screen fallback.
      style={{ height: '100dvh' }}
    >
      {/* Mobile-proportioned portrait stage */}
      <main
        className="relative h-full w-full max-w-md overflow-hidden bg-slate-900 shadow-2xl flex flex-col"
        style={{ touchAction: 'none' }}
      >
        {/* 60fps Canvas 2D Engine Viewport (with the WebGL compositor canvas) */}
        <GameCanvas
          engine={engine}
          onTap={handleGameInput}
          inputEnabled={!isSkinModalOpen && !isFxOpen}
          fxPreference={fxPreference}
          onEffectiveTierChange={handleEffectiveTierChange}
          qaFlags={qaFlags}
          metricsRef={debugMetricsRef}
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

        {/* Start Screen Overlay: Tap to Swim Guide & Wardrobe. `?freeze` skips
            it so the deterministic fixture frame is unobstructed. */}
        {!qaFlags.freeze && status === 'idle' && (
          <StartScreen
            highScore={highScore}
            lifetimePearls={lifetimePearls}
            activeSkin={activeSkin}
            onOpenSkins={() => setIsSkinModalOpen(true)}
            onStart={handleGameInput}
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
            isFxActive={effectiveTier !== 'off'}
            onRetry={handleGameInput}
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
          failureMessage={fxFailureMessage}
          onSelect={handleSelectFx}
          onClose={handleCloseFx}
        />

        {/* ?debug=1 frame stats; renders null in a normal load. */}
        <DebugOverlay visible={qaFlags.debug} metricsRef={debugMetricsRef} />
      </main>
    </div>
  );
}

export default App;
