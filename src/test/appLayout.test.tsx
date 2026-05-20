import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useAppStore } from '../store/store';

vi.mock('../components/CodeEditor', () => ({
  default: () => <div data-testid="code-editor" />,
}));

vi.mock('../views/GeneralView', () => ({
  default: () => <div data-testid="general-view" />,
}));

vi.mock('../views/InterconnectionView', () => ({
  default: () => <div data-testid="interconnection-view" />,
}));

vi.mock('../views/ActionFlowView', () => ({
  default: () => <div data-testid="action-flow-view" />,
}));

vi.mock('../views/StateTransitionView', () => ({
  default: () => <div data-testid="state-transition-view" />,
}));

vi.mock('../views/RequirementsView', () => ({
  default: () => <div data-testid="requirements-view" />,
}));

vi.mock('../views/ViewpointsView', () => ({
  default: () => <div data-testid="viewpoints-view" />,
}));

vi.mock('../components/DrawioBridgeView', () => ({
  default: () => <div data-testid="drawio-view" />,
}));

describe('app layout behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().resetToExample('vehicle');
    useAppStore.getState().selectNode(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('starts diagram-first while preserving explicit properties access', () => {
    render(<App />);

    const propertiesButton = screen.getByRole('button', { name: 'Toggle properties panel' });

    expect(screen.getByTestId('general-view')).toBeInTheDocument();
    expect(screen.queryByText('No element selected')).not.toBeInTheDocument();
    expect(propertiesButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(propertiesButton);

    expect(screen.getByText('No element selected')).toBeInTheDocument();
    expect(propertiesButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens useful properties when a model explorer item is selected from the keyboard', () => {
    render(<App />);

    const propertiesButton = screen.getByRole('button', { name: 'Toggle properties panel' });
    const firstTreeItem = screen.getAllByRole('treeitem')[0];

    expect(screen.queryByText('No element selected')).not.toBeInTheDocument();

    fireEvent.keyDown(firstTreeItem, { key: 'Enter' });

    expect(useAppStore.getState().selectedNodeId).toBeTruthy();
    expect(screen.getAllByText('Package').length).toBeGreaterThan(1);
    expect(propertiesButton).toHaveAttribute('aria-pressed', 'true');
  });
});
