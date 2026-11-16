import React from 'react';
import type { SkinId, SkinDefinition } from '../game/types';
import { SKIN_DEFINITIONS } from '../game/constants';
import { isSkinUnlocked } from '../game/storage';

export interface SkinSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  activeSkin: SkinId;
  lifetimePearls: number;
  onSelectSkin: (skinId: SkinId) => void;
}

const ALL_SKINS: SkinDefinition[] = Object.values(SKIN_DEFINITIONS);

/**
 * Milestone skin wardrobe modal:
 * - Neon Tetra (0 pearls - Default)
 * - Clownfish (50 lifetime pearls)
 * - Golden Manta (150 lifetime pearls)
 * Shows locked/unlocked status, equips active skin, and saves choice.
 */
export const SkinSelector: React.FC<SkinSelectorProps> = ({
  isOpen,
  onClose,
  activeSkin,
  lifetimePearls,
  onSelectSkin,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-testid="skin-selector-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md select-none animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black tracking-wide text-white flex items-center space-x-2">
              <span>🐠</span>
              <span>Skin Wardrobe</span>
            </h2>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
              <span>Bank Balance:</span>
              <span data-testid="skin-modal-pearls" className="font-bold text-cyan-300">
                ⚪ {lifetimePearls} Pearls
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-skins-modal"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            aria-label="Close skins modal"
          >
            ✕
          </button>
        </div>

        {/* Skin Cards List */}
        <div className="my-4 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {ALL_SKINS.map((skin) => {
            const isUnlocked = isSkinUnlocked(skin.id, lifetimePearls);
            const isEquipped = activeSkin === skin.id;

            return (
              <div
                key={skin.id}
                className={`relative flex items-center justify-between rounded-xl p-3.5 border transition-all ${
                  isEquipped
                    ? 'bg-slate-800/90 border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                    : isUnlocked
                    ? 'bg-slate-900/70 border-slate-700/60 hover:border-slate-600'
                    : 'bg-slate-950/60 border-slate-800/50 opacity-75'
                }`}
              >
                {/* Left: Swatch and Details */}
                <div className="flex items-center space-x-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center border-2 shadow-sm"
                    style={{
                      borderColor: skin.primaryColor,
                      backgroundColor: `${skin.primaryColor}22`,
                    }}
                  >
                    <span className="text-lg">
                      {skin.id === 'golden-manta' ? '✨' : skin.id === 'clownfish' ? '🐡' : '🐟'}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-white">{skin.name}</span>
                      {skin.requiredPearls > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          ({skin.requiredPearls} ⚪)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 max-w-[170px] leading-tight">
                      {skin.description}
                    </p>
                  </div>
                </div>

                {/* Right: Equip / Locked / Equipped action */}
                <div>
                  {isEquipped ? (
                    <span
                      data-testid={`skin-equipped-${skin.id}`}
                      className="rounded-lg bg-cyan-950/80 border border-cyan-400 px-3 py-1.5 text-xs font-bold text-cyan-200"
                    >
                      Equipped
                    </span>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      data-testid={`skin-equip-${skin.id}`}
                      onClick={() => onSelectSkin(skin.id)}
                      className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-transform active:scale-95"
                    >
                      Equip
                    </button>
                  ) : (
                    <div
                      data-testid={`skin-locked-${skin.id}`}
                      className="flex items-center space-x-1 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                    >
                      <span>🔒</span>
                      <span>{skin.requiredPearls}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer tip */}
        <p className="text-center text-[11px] text-slate-400/80">
          Pearls are never spent — they unlock milestones permanently!
        </p>
      </div>
    </div>
  );
};
