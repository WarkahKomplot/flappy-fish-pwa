import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FxPanel } from '../../src/components/FxPanel';
import { StartScreen } from '../../src/components/StartScreen';

const noopProps = {
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('FxPanel', () => {
  it('renders all five options and marks the selected one', () => {
    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    for (const label of ['Auto', 'High', 'Medium', 'Low', 'Off']) {
      expect(screen.getByText(label)).toBeDefined();
    }

    expect(screen.getByTestId('fx-option-auto').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('fx-option-high').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('fx-effective-tier').textContent).toContain('High');
  });

  it('selects a tier and closes on Escape', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('fx-option-low'));
    expect(onSelect).toHaveBeenCalledWith('low');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not start the game when opened from the start screen', () => {
    const onStart = vi.fn();
    const onOpenFx = vi.fn();

    render(
      <StartScreen
        highScore={0}
        lifetimePearls={0}
        activeSkin="neon-tetra"
        onOpenSkins={vi.fn()}
        onStart={onStart}
        onOpenFx={onOpenFx}
      />
    );

    fireEvent.click(screen.getByTestId('fx-open-button'));
    expect(onOpenFx).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows the resolved tier for the current preference and updates with props', () => {
    const { rerender } = render(
      <FxPanel isOpen preference="auto" effectiveTier="high" {...noopProps} />
    );

    expect(screen.getByTestId('fx-option-auto').getAttribute('aria-checked')).toBe('true');

    expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Auto');
    expect(screen.getByTestId('fx-effective-tier').textContent).toContain('High');

    rerender(<FxPanel isOpen preference="medium" effectiveTier="medium" {...noopProps} />);

    expect(screen.getByTestId('fx-option-medium').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('fx-option-auto').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Medium');

    rerender(<FxPanel isOpen preference="low" effectiveTier="off" {...noopProps} />);

    // A failed GL switch is reported as Off while the chosen preference stays
    // visible, so the user can see what happened and pick another option.
    expect(screen.getByTestId('fx-effective-tier').textContent).toContain('Off');
    expect(screen.getByTestId('fx-option-low').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the panel open after a selection so the effective tier can update', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('fx-option-high'));

    expect(onSelect).toHaveBeenCalledWith('high');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a backdrop click but not on a panel click', () => {
    const onClose = vi.fn();

    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('fx-panel'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('fx-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the panel and returns it to the trigger on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'open fx';
    document.body.appendChild(trigger);
    trigger.focus();

    const props = {
      preference: 'auto' as const,
      effectiveTier: 'high' as const,
      onSelect: vi.fn(),
      onClose: vi.fn(),
    };

    const { rerender } = render(<FxPanel isOpen={false} {...props} />);

    rerender(<FxPanel isOpen {...props} />);

    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).toBe(screen.getByTestId('fx-option-auto'));

    rerender(<FxPanel isOpen={false} {...props} />);

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('renders nothing while closed', () => {
    render(
      <FxPanel
        isOpen={false}
        preference="auto"
        effectiveTier="high"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByTestId('fx-panel')).toBeNull();
  });

  it('shows a failure message inline without changing the selected option', () => {
    render(
      <FxPanel
        isOpen
        preference="off"
        effectiveTier="off"
        failureMessage="Effects unavailable — switched to Off"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('fx-failure-message').textContent).toContain(
      'Effects unavailable — switched to Off'
    );
    expect(screen.getByTestId('fx-option-off').getAttribute('aria-checked')).toBe('true');
  });

  it('does not render a failure message for a legitimate Auto · Off', () => {
    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="off"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByTestId('fx-failure-message')).toBeNull();
  });

  it('activates a radio with Space and keeps the key inside the dialog', () => {
    const onSelect = vi.fn();

    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByTestId('fx-option-low'), {
      key: ' ',
      code: 'Space',
    });

    expect(onSelect).toHaveBeenCalledWith('low');
  });

  it('moves selection and focus with arrow keys like a native radio group', () => {
    const onSelect = vi.fn();

    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByTestId('fx-option-auto'), {
      key: 'ArrowDown',
      code: 'ArrowDown',
    });
    expect(onSelect).toHaveBeenLastCalledWith('high');
    expect(document.activeElement).toBe(screen.getByTestId('fx-option-high'));

    fireEvent.keyDown(screen.getByTestId('fx-option-high'), {
      key: 'ArrowUp',
      code: 'ArrowUp',
    });
    expect(onSelect).toHaveBeenLastCalledWith('auto');
    expect(document.activeElement).toBe(screen.getByTestId('fx-option-auto'));

    // Wrap backwards from the first option to the last.
    fireEvent.keyDown(screen.getByTestId('fx-option-auto'), {
      key: 'ArrowUp',
      code: 'ArrowUp',
    });
    expect(onSelect).toHaveBeenLastCalledWith('off');
    expect(document.activeElement).toBe(screen.getByTestId('fx-option-off'));
  });

  it('traps Tab focus inside the dialog', () => {
    render(
      <FxPanel
        isOpen
        preference="auto"
        effectiveTier="high"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const close = screen.getByTestId('fx-close-button');
    const last = screen.getByTestId('fx-option-off');

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab', code: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
