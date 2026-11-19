import React, { useEffect } from 'react';

export interface GameOverModalProps {
  score: number;
  highScore: number;
  runPearls: number;
  lifetimePearls: number;
  onRetry: () => void;
  isNewHighScore?: boolean;
  /**
   * True while the WebGL compositor owns the stage. A backdrop-filter blur over
   * a continuously animating canvas re-blurs the full stage every frame, so the
   * GL path uses a static dark scrim and panel instead.
   */
  isFxActive?: boolean;
}

/**
 * Game Over overlay modal:
 * - High-contrast arcade score summary
 * - Run pearls and cumulative lifetime pearls bank
 * - Frictionless <0.2s instant tap anywhere to retry
 */
export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  highScore,
  runPearls,
  lifetimePearls,
  onRetry,
  // Must be supplied by the caller (the engine compares against the previous
  // best before saving). Defaulting to `score >= highScore` was wrong: by the
  // time this renders, highScore already includes the current run, so a tie
  // was celebrated as a new record.
  isNewHighScore = false,
  isFxActive = false,
}) => {
  // Listen for Space/Enter key for instant desktop keyboard retry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        onRetry();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRetry]);

  return (
    <div
      data-testid="game-over-modal"
      onClick={onRetry}
      className={`pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center p-6 select-none cursor-pointer transition-opacity duration-150 animate-fadeIn ${
        isFxActive ? 'bg-slate-950/90' : 'bg-slate-950/80 backdrop-blur-md'
      }`}
    >
      <div
        data-testid="game-over-panel"
        className={`w-full max-w-xs rounded-2xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-2xl text-center ${
          isFxActive ? '' : 'backdrop-blur-xl'
        }`}
        onClick={() => {
          // Allow tapping anywhere on modal box to retry as well
          onRetry();
        }}
      >
        {/* Modal Header */}
        <div className="mb-4">
          <span className="text-4xl">💥</span>
          <h2 className="mt-2 text-3xl font-black tracking-wide text-rose-500 drop-shadow-[0_2px_10px_rgba(244,63,94,0.6)]">
            GAME OVER
          </h2>
          {isNewHighScore && (
            <div className="mt-1 inline-block rounded-full bg-amber-400/20 border border-amber-400 px-3 py-0.5 text-[11px] font-bold text-amber-300 animate-pulse">
              🎉 NEW BEST!
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="my-5 grid grid-cols-2 gap-3 text-left">
          {/* Score */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Score
            </span>
            <div
              data-testid="game-over-score"
              className="text-2xl font-black text-white"
            >
              {score}
            </div>
          </div>

          {/* High Score */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Best
            </span>
            <div
              data-testid="game-over-high-score"
              className="text-2xl font-black text-amber-300"
            >
              {highScore}
            </div>
          </div>

          {/* Run Pearls */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Run Pearls
            </span>
            <div
              data-testid="game-over-run-pearls"
              className="text-2xl font-black text-cyan-300"
            >
              {runPearls}
            </div>
          </div>

          {/* Lifetime Pearls */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Bank
            </span>
            <div
              data-testid="game-over-lifetime-pearls"
              className="text-2xl font-black text-emerald-300"
            >
              {lifetimePearls}
            </div>
          </div>
        </div>

        {/* Retry Button */}
        <button
          type="button"
          data-testid="retry-button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 py-3.5 text-sm font-black tracking-wider text-white uppercase shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-transform active:scale-95"
        >
          🔄 Play Again
        </button>

        {/* Subtitle helper */}
        <p
          data-testid="retry-prompt"
          className="mt-3 text-xs font-medium text-slate-400/80 animate-pulse"
        >
          Tap anywhere to retry (<span className="text-cyan-300">&lt;0.2s</span>)
        </p>
      </div>
    </div>
  );
};
