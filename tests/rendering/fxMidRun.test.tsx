import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The real GameCanvas needs a GPU; this test only exercises App's FX failure
// policy, so it drives the same callback the canvas would report.
vi.mock('../../src/components/GameCanvas', () => ({
  GameCanvas: (props: { onEffectiveTierChange?: (tier: string) => void }) => (
    <div>
      <button
        data-testid="sim-gl-high"
        onClick={() => props.onEffectiveTierChange?.('high')}
      />
      <button
        data-testid="sim-gl-off"
        onClick={() => props.onEffectiveTierChange?.('off')}
      />
    </div>
  ),
}));

import { App } from '../../src/App';

describe('mid-run FX fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reverts to Off with a message when a live High path stops mid-run', () => {
    localStorage.setItem('flappy_fish_fx', 'high');
    render(<App />);

    // The stored High is pending; a successful High report clears it.
    fireEvent.click(screen.getByTestId('sim-gl-high'));
    // A later final Off (mid-run fallback) has no pending selection and must
    // still revert/persist Off and explain why.
    fireEvent.click(screen.getByTestId('sim-gl-off'));

    expect(localStorage.getItem('flappy_fish_fx')).toBe('off');

    fireEvent.click(screen.getByTestId('fx-open-button'));
    expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByTestId('fx-option-high').getAttribute('aria-checked')).toBe(
      'false'
    );
    expect(screen.getByTestId('fx-failure-message').textContent).toContain(
      'switched to Off'
    );
  });

  it('does not revert a legitimate Auto -> Off report', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('sim-gl-off'));

    // Auto is allowed to resolve Off silently; no persisted downgrade.
    expect(localStorage.getItem('flappy_fish_fx')).not.toBe('off');
    fireEvent.click(screen.getByTestId('fx-open-button'));
    expect(screen.queryByTestId('fx-failure-message')).toBeNull();
  });
});
