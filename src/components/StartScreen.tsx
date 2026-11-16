import React from 'react';
import type { SkinId } from '../game/types';
import { SKIN_DEFINITIONS } from '../game/constants';

export interface StartScreenProps {
  highScore: number;
  lifetimePearls: number;
  activeSkin: SkinId;
  onOpenSkins: () => void;
  onStart?: () => void;
}

/**
 * Start screen overlay:
 * - Bioluminescent "Flappy Fish" game title
 * - "Tap to Swim" pulse guide with animated tap pointer
 * - Current equipped skin badge and Skins wardrobe button
 * - Lifetime stats (High Score & Pearl Bank)
 */
export const StartScreen: React.FC<StartScreenProps> = ({
  highScore,
  lifetimePearls,
  activeSkin,
  onOpenSkins,
  onStart,
}) => {
  const currentSkinDef = SKIN_DEFINITIONS[activeSkin] ?? SKIN_DEFINITIONS['neon-tetra'];

  return (
    <div
      data-testid="start-screen"
      onClick={onStart}
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-between p-6 select-none cursor-pointer"
    >
      {/* Top Header stats */}
      <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-300/80 pt-14">
        <div className="flex items-center space-x-1.5 rounded-full bg-slate-900/60 px-3 py-1 border border-slate-700/50 backdrop-blur-sm">
          <span>🏆 Best:</span>
          <span data-testid="start-high-score" className="font-bold text-amber-300">
            {highScore}
          </span>
        </div>
        <div className="flex items-center space-x-1.5 rounded-full bg-slate-900/60 px-3 py-1 border border-slate-700/50 backdrop-blur-sm">
          <span>⚪ Pearls:</span>
          <span data-testid="start-lifetime-pearls" className="font-bold text-cyan-300">
            {lifetimePearls}
          </span>
        </div>
      </div>

      {/* Hero Title & Subtitle */}
      <div className="flex flex-col items-center text-center mt-6">
        <h1
          data-testid="game-title"
          className="text-5xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 via-cyan-400 to-blue-600 drop-shadow-[0_4px_16px_rgba(0,240,255,0.7)]"
        >
          Flappy Fish
        </h1>
        <p className="mt-1 text-xs font-medium tracking-widest text-cyan-200/70 uppercase">
          Deep-Sea Bioluminescent Odyssey
        </p>

        {/* Animated Tap Guide */}
        <div
          data-testid="tap-guide"
          className="mt-12 flex flex-col items-center space-y-2 text-cyan-200 animate-bounce"
        >
          <div className="text-4xl drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]">👆</div>
          <span className="text-sm font-bold tracking-widest uppercase text-cyan-100 bg-cyan-950/60 px-4 py-1.5 rounded-full border border-cyan-500/40 backdrop-blur-md">
            Tap to Swim
          </span>
        </div>
      </div>

      {/* Bottom Bar: Equipped Skin & Skins Button */}
      <div
        className="w-full flex flex-col items-center pb-8 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3">
          {/* Current skin badge */}
          <div
            data-testid="current-skin-badge"
            className="flex items-center space-x-2 rounded-xl bg-slate-900/80 border border-slate-700/70 px-4 py-2 backdrop-blur-md shadow-lg"
          >
            <span className="text-xs text-slate-400 font-medium">Equipped:</span>
            <span
              className="text-xs font-bold"
              style={{ color: currentSkinDef.primaryColor }}
            >
              {currentSkinDef.name}
            </span>
          </div>

          {/* Skins modal toggle button */}
          <button
            type="button"
            data-testid="skins-button"
            onClick={onOpenSkins}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] transition-transform active:scale-95"
          >
            <span>🐠</span>
            <span>Skins</span>
          </button>
        </div>
      </div>
    </div>
  );
};
