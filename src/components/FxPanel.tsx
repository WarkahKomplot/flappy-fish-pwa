import React, { useEffect, useRef } from 'react';
import type { FxPreference, QualityTier } from '../game/rendering/types';

export interface FxPanelProps {
  isOpen: boolean;
  preference: FxPreference;
  effectiveTier: QualityTier;
  /** Short inline explanation, e.g. after a failed GL switch. */
  failureMessage?: string | null;
  onSelect: (pref: FxPreference) => void;
  onClose: () => void;
}

const FX_OPTIONS: ReadonlyArray<FxPreference> = ['auto', 'high', 'medium', 'low', 'off'];

const LABEL: Record<FxPreference, string> = {
  auto: 'Auto',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  off: 'Off',
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(dialog: HTMLElement | null): HTMLElement[] {
  if (!dialog) {
    return [];
  }
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Reads the FxPreference out of an `fx-option-<value>` test id. */
function radioValue(target: EventTarget | null): FxPreference | null {
  const radio =
    target instanceof Element ? target.closest<HTMLElement>('[role="radio"]') : null;
  const value = radio?.getAttribute('data-testid')?.replace('fx-option-', '');
  return value && FX_OPTIONS.includes(value as FxPreference)
    ? (value as FxPreference)
    : null;
}

/**
 * Emergency quality switch (spec §7.10): Auto / High / Medium / Low / Off,
 * always showing the resolved tier. It never starts a run, and it owns every
 * key pressed inside it so the game's window-level tap input cannot fire.
 */
export const FxPanel: React.FC<FxPanelProps> = ({
  isOpen,
  preference,
  effectiveTier,
  failureMessage,
  onSelect,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Move focus in on open and return it to the trigger on close.
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
      if (element && document.contains(element)) {
        element.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, onClose]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // GameCanvas listens on window for Space/ArrowUp; keep panel keys local.
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      const focusables = focusableIn(dialogRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // The dialog itself is tabIndex=-1; treat it as outside so Shift+Tab
      // cannot escape to the game behind the modal.
      const inside =
        active !== dialogRef.current && (dialogRef.current?.contains(active) ?? false);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    const value = radioValue(event.target);
    if (!value) {
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
      // Activate on keydown so the key cannot reach the game's window handler.
      event.preventDefault();
      onSelect(value);
      return;
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowLeft'
    ) {
      event.preventDefault();
      const current = FX_OPTIONS.indexOf(value);
      const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      const next = FX_OPTIONS[(current + delta + FX_OPTIONS.length) % FX_OPTIONS.length];
      onSelect(next);
      dialogRef.current
        ?.querySelector<HTMLElement>(`[data-testid="fx-option-${next}"]`)
        ?.focus();
    }
  };

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
        onKeyDown={handleDialogKeyDown}
        className="max-h-full w-full max-w-xs overflow-y-auto rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-4 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="fx-panel-title" className="text-sm font-black uppercase tracking-widest text-cyan-200">
            Visual Effects
          </h2>
          <button
            type="button"
            data-testid="fx-close-button"
            onClick={onClose}
            aria-label="Close visual effects settings"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/60 bg-slate-800/80 text-sm text-slate-200 active:scale-90"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs">
          <span className="text-slate-400">Effective </span>
          <span
            data-testid="fx-effective-tier"
            className="font-bold text-cyan-300"
            aria-live="polite"
          >
            {LABEL[preference]} · {LABEL[effectiveTier]}
          </span>
        </div>

        {failureMessage ? (
          <p
            data-testid="fx-failure-message"
            role="status"
            className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          >
            {failureMessage}
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Visual effects quality" className="mt-3 flex flex-col gap-2">
          {FX_OPTIONS.map((value) => {
            const isChecked = preference === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isChecked}
                data-testid={`fx-option-${value}`}
                onClick={() => onSelect(value)}
                className={`min-h-[44px] w-full rounded-xl border px-3 text-sm font-semibold ${
                  isChecked
                    ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100'
                    : 'border-slate-700/60 bg-slate-800/40 text-slate-200'
                }`}
              >
                {LABEL[value]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FxPanel;
