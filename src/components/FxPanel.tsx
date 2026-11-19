import React, { useEffect, useRef } from 'react';
import type { FxPreference, QualityTier } from '../game/rendering/types';

export interface FxPanelProps {
  isOpen: boolean;
  preference: FxPreference;
  effectiveTier: QualityTier;
  onSelect: (pref: FxPreference) => void;
  onClose: () => void;
}

interface FxOption {
  value: FxPreference;
  label: string;
  hint: string;
}

const FX_OPTIONS: ReadonlyArray<FxOption> = [
  { value: 'auto', label: 'Auto', hint: 'Best tier for this device' },
  { value: 'high', label: 'High', hint: 'Bloom, rays and particles' },
  { value: 'medium', label: 'Medium', hint: 'Bloom with lighter effects' },
  { value: 'low', label: 'Low', hint: 'GL scene, no post effects' },
  { value: 'off', label: 'Off', hint: 'Classic Canvas 2D' },
];

const PREF_LABEL: Record<FxPreference, string> = {
  auto: 'Auto',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  off: 'Off',
};

const TIER_LABEL: Record<QualityTier, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  off: 'Off',
};

/**
 * Emergency quality switch (spec §7.10):
 * - one radio group for Auto / High / Medium / Low / Off;
 * - always shows the currently resolved tier, which may differ from the
 *   chosen preference (Auto resolves against hardware; a failed GL switch
 *   resolves to Off);
 * - Escape, the backdrop and the close button dismiss it, and focus returns
 *   to the trigger;
 * - selecting an option only changes the preference. It never starts a run.
 */
export const FxPanel: React.FC<FxPanelProps> = ({
  isOpen,
  preference,
  effectiveTier,
  onSelect,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Remember the trigger so closing restores focus to the control that opened
  // the panel (a start-screen button or the paused HUD).
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previous = typeof document !== 'undefined' ? document.activeElement : null;
    returnFocusRef.current = previous instanceof HTMLElement ? previous : null;

    const dialog = dialogRef.current;
    const target =
      dialog?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
      dialog?.querySelector<HTMLElement>('[role="radio"]') ??
      dialog;
    target?.focus();

    return () => {
      const element = returnFocusRef.current;
      returnFocusRef.current = null;
      if (element && typeof element.focus === 'function' && document.contains(element)) {
        element.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="fx-panel-backdrop"
      className="absolute inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-panel-title"
        data-testid="fx-panel"
        tabIndex={-1}
        className="w-full max-w-xs rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-4 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="fx-panel-title" className="text-sm font-black uppercase tracking-widest text-cyan-200">
              Visual Effects
            </h2>
            <p className="mt-1 text-[11px] text-slate-400">
              If the screen looks wrong, switch to Off.
            </p>
          </div>
          <button
            type="button"
            data-testid="fx-close-button"
            onClick={onClose}
            aria-label="Close visual effects settings"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/60 bg-slate-800/80 text-sm text-slate-200 transition-transform active:scale-90 hover:bg-slate-700/80"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Effective
          </span>
          <span
            data-testid="fx-effective-tier"
            className="text-xs font-bold text-cyan-300"
            aria-live="polite"
          >
            {PREF_LABEL[preference]} · {TIER_LABEL[effectiveTier]}
          </span>
        </div>

        <div role="radiogroup" aria-label="Visual effects quality" className="mt-3 flex flex-col gap-2">
          {FX_OPTIONS.map((option) => {
            const isChecked = preference === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isChecked}
                data-testid={`fx-option-${option.value}`}
                onClick={() => onSelect(option.value)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.99] ${
                  isChecked
                    ? 'border-cyan-400/70 bg-cyan-500/15 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isChecked
                      ? 'border-cyan-300 bg-cyan-400 text-[10px] text-slate-950'
                      : 'border-slate-600 bg-slate-900'
                  }`}
                >
                  {isChecked ? '●' : ''}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-slate-100">{option.label}</span>
                  <span className="text-[10px] leading-tight text-slate-400">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] leading-snug text-slate-500">
          Your choice is saved on this device. Auto follows the device.
        </p>
      </div>
    </div>
  );
};

export default FxPanel;
