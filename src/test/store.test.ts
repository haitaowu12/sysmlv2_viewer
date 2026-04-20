import { describe, it, expect } from 'vitest';
import { useAppStore } from '../store/store';

describe('useAppStore', () => {
  it('parses source code and updates model', () => {
    useAppStore.getState().setSourceCode("part def Vehicle {\n}");
    const store = useAppStore.getState();
    expect(store.model?.children.length).toBeGreaterThanOrEqual(1);
  });

  it('selects and deselects nodes', () => {
    useAppStore.getState().selectNode('test-node-id');
    expect(useAppStore.getState().selectedNodeId).toBe('test-node-id');
    useAppStore.getState().selectNode(null);
    expect(useAppStore.getState().selectedNodeId).toBeNull();
  });

  it('toggles dark mode', () => {
    const initial = useAppStore.getState().isDarkMode;
    useAppStore.getState().toggleDarkMode();
    expect(useAppStore.getState().isDarkMode).toBe(!initial);
    useAppStore.getState().toggleDarkMode();
  });

  it('toggles explorer visibility', () => {
    const initial = useAppStore.getState().showExplorer;
    useAppStore.getState().toggleExplorer();
    expect(useAppStore.getState().showExplorer).toBe(!initial);
    useAppStore.getState().toggleExplorer();
  });

  it('toggles property panel visibility', () => {
    const initial = useAppStore.getState().showPropertyPanel;
    useAppStore.getState().togglePropertyPanel();
    expect(useAppStore.getState().showPropertyPanel).toBe(!initial);
    useAppStore.getState().togglePropertyPanel();
  });

  it('pushes to undo history on source code change', () => {
    const initialHistoryLength = useAppStore.getState().history.length;
    useAppStore.getState().setSourceCode("part def HistoryTest {\n}");
    expect(useAppStore.getState().history.length).toBeGreaterThan(initialHistoryLength);
  });

  it('canUndo returns true after changes', () => {
    useAppStore.getState().setSourceCode("part def CanUndoTest {\n}");
    expect(useAppStore.getState().canUndo()).toBe(true);
  });

  it('sets active view', () => {
    useAppStore.getState().setActiveView('actionFlow');
    expect(useAppStore.getState().activeView).toBe('actionFlow');
  });

  it('sets and clears focused node', () => {
    useAppStore.getState().setFocusedNode('node-1');
    expect(useAppStore.getState().focusedNodeId).toBe('node-1');
    useAppStore.getState().setFocusedNode(null);
    expect(useAppStore.getState().focusedNodeId).toBeNull();
  });
});
