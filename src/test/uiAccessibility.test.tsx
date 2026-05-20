import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import ModelExplorer from '../components/ModelExplorer';
import ResizablePanel from '../components/ResizablePanel';
import { useAppStore } from '../store/store';

describe('UI accessibility controls', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().resetToExample('vehicle');
    useAppStore.getState().selectNode(null);
  });

  it('selects model explorer items with the keyboard', () => {
    render(<ModelExplorer />);

    const tree = screen.getByRole('tree', { name: /model tree/i });
    const firstItem = screen.getAllByRole('treeitem')[0];

    expect(tree).toBeInTheDocument();
    fireEvent.keyDown(firstItem, { key: 'Enter' });

    expect(useAppStore.getState().selectedNodeId).toBeTruthy();
    expect(firstItem).toHaveAttribute('aria-selected', 'true');
  });

  it('resizes side panels from the separator keyboard controls', () => {
    render(
      <ResizablePanel defaultWidth={250} minWidth={180} maxWidth={400} side="left" persistKey="test-left-panel">
        <div>Explorer content</div>
      </ResizablePanel>,
    );

    const separator = screen.getByRole('separator', { name: /resize left panel/i });
    expect(separator).toHaveAttribute('aria-valuenow', '250');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });

    expect(separator).toHaveAttribute('aria-valuenow', '260');
  });
});
