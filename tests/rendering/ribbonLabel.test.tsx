import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RibbonLabel } from '../../src/components/RibbonLabel';

describe('RibbonLabel DOM badge', () => {
  it('renders BEST at the mapped position and never takes pointer events', () => {
    render(<RibbonLabel x={120} y={180} target={8} visible />);

    const label = screen.getByTestId('ribbon-label');
    expect(label.style.left).toBe('120px');
    expect(label.style.top).toBe('180px');
    expect(label.style.pointerEvents).toBe('none');
    expect(label.style.opacity).toBe('1');
    expect(label.textContent).toContain('BEST: 8');
  });

  it('hides without unmounting when it is not visible', () => {
    const { rerender } = render(
      <RibbonLabel x={40} y={50} target={2} visible={false} />
    );

    const label = screen.getByTestId('ribbon-label');
    expect(label.style.opacity).toBe('0');
    expect(label.getAttribute('aria-hidden')).toBe('true');

    rerender(<RibbonLabel x={210} y={260} target={2} visible />);
    expect(label.style.left).toBe('210px');
    expect(label.style.top).toBe('260px');
    expect(label.style.opacity).toBe('1');
    expect(label.getAttribute('aria-hidden')).toBe('false');
  });
});
