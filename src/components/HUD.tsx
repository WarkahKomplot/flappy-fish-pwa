import React from 'react';
import type { GameStatus } from '../game/types';

export interface HUDProps {
  score: number;
  combo: number; // 0, 1, 2, 3
  hasShield: boolean;
  isPaused: boolean;
  isMuted: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  status: GameStatus;
  /** Opens the FX panel from the pause overlay. */
  onOpenFx?: () => void;
}

/**
 * In-game HUD overlay:
 * - Large clear score typography
 * - 3-Pearl combo meter with golden glow
 * - Pulsing cyan Bubble Shield badge
 * - Tactile pause/resume and audio mute toggles
 */
export const HUD: React.FC<HUDProps> = ({
  score,
  combo,
  hasShield,
  isPaused,
  isMuted,
  onTogglePause,
  onToggleMute,
  status,
  onOpenFx,
}) => {
  const isPlayingOrPaused = status === 'playing' || status === 'paused';

  return (
    <div
      data-testid="hud-root"
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none"
    >
      {/* Static readability scrims behind the score/combo. CSS-only and
          non-interactive; the 44 px controls keep their hit areas. */}
      {isPlayingOrPaused && (
        <>
          <div aria-hidden="true" className="hud-scrim hud-scrim-top" />
          <div aria-hidden="true" className="hud-scrim hud-scrim-bottom" />
        </>
      )}

      {/* Top Bar: Controls & Current Score */}
      <div className="flex items-start justify-between">
        {/* Left Control Buttons: Audio Mute & Pause */}
        <div className="pointer-events-auto flex items-center space-x-2">
          <button
            type="button"
            data-testid="mute-button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/70 border border-slate-700/60 text-lg text-white shadow-lg backdrop-blur-md transition-transform active:scale-90 hover:bg-slate-800/80"
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          {isPlayingOrPaused && (
            <button
              type="button"
              data-testid="pause-button"
              onClick={onTogglePause}
              aria-label={isPaused ? 'Resume game' : 'Pause game'}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/70 border border-slate-700/60 text-lg text-white shadow-lg backdrop-blur-md transition-transform active:scale-90 hover:bg-slate-800/80"
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>
          )}
        </div>

        {/* Center/Right Score Display */}
        {isPlayingOrPaused && (
          <div className="flex flex-col items-end">
            <div
              data-testid="hud-score"
              className="text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] [text-shadow:_0_2px_10px_rgb(0_240_255_/_40%)]"
            >
              {score}
            </div>
          </div>
        )}
      </div>

      {/* Middle Top Status Badges: Shield & Combo */}
      {isPlayingOrPaused && (
        <div className="flex flex-col items-center space-y-2">
          {/* Bubble Shield Badge */}
          {hasShield && (
            <div
              data-testid="shield-badge"
              className="inline-flex items-center space-x-2 rounded-full border-2 border-cyan-400 bg-cyan-950/80 px-4 py-1 text-xs font-bold uppercase tracking-wider text-cyan-200 shadow-[0_0_16px_rgba(6,182,212,0.8)] backdrop-blur-sm animate-pulse"
            >
              <span className="text-sm">🛡️</span>
              <span>SHIELD ACTIVE</span>
            </div>
          )}

          {/* 3-Pearl Combo Meter */}
          <div
            data-testid="combo-meter"
            className="flex items-center space-x-2 rounded-full bg-slate-950/60 px-3 py-1.5 backdrop-blur-md border border-slate-800/50"
          >
            <span className="text-[10px] font-semibold tracking-wider text-slate-300 mr-1 uppercase">
              Combo
            </span>
            {[0, 1, 2].map((i) => {
              const isActive = i < combo;
              return (
                <div
                  key={i}
                  data-testid={`combo-dot-${i}`}
                  data-active={isActive ? 'true' : 'false'}
                  className={`h-4 w-4 rounded-full transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-tr from-amber-400 to-amber-200 border-2 border-amber-100 shadow-[0_0_10px_#fde047] scale-110'
                      : 'bg-slate-800/70 border border-slate-600/60'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom spacer / touch guide placeholder if paused */}
      {isPaused && (
        <div className="flex flex-col items-center gap-3 pb-8">
          {/* The pause overlay is the primary FX entry point; the parent HUD is
              pointer-events-none, so this control opts back in. */}
          <button
            type="button"
            data-testid="fx-open-button"
            onClick={onOpenFx}
            aria-label="Open visual effects settings"
            className="pointer-events-auto flex h-11 items-center space-x-1.5 rounded-xl border border-cyan-500/40 bg-slate-900/80 px-3 text-xs font-bold text-cyan-200 shadow-lg backdrop-blur-md transition-transform active:scale-95 hover:bg-slate-800/80"
          >
            <span aria-hidden="true">✨</span>
            <span>FX</span>
          </button>

          <div className="rounded-xl bg-slate-900/90 border border-cyan-500/40 px-6 py-3 text-center text-sm font-semibold text-cyan-200 shadow-2xl backdrop-blur-md animate-pulse">
            Game Paused — Tap Resume to continue
          </div>
        </div>
      )}
      {!isPaused && <div />}
    </div>
  );
};
