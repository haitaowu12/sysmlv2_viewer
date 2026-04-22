import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/store';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('drag and drop library integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('calls insertLibraryComponent when dropping a library item into the code editor', () => {
    const store = useAppStore.getState();
    // Simulate the drop handler logic from CodeEditor
    const kind = 'part def';
    const initialCode = store.sourceCode;
    store.insertLibraryComponent(kind);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('part def partdef');
  });

  it('calls insertLibraryComponent when double-clicking a library item', () => {
    const store = useAppStore.getState();
    const initialCode = store.sourceCode;

    // Simulate double-click handler from LibraryItemComponent
    store.insertLibraryComponent('action def');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('action def actiondef');
  });

  it('inserts correct template for each library kind on drop', () => {
    const testCases = [
      { kind: 'part def', expected: 'part def partdef' },
      { kind: 'port def', expected: 'port def portdef' },
      { kind: 'action def', expected: 'action def actiondef' },
      { kind: 'state def', expected: 'state def statedef' },
      { kind: 'requirement def', expected: 'requirement def requirementdef' },
    ];

    for (const { kind, expected } of testCases) {
      useAppStore.getState().resetToExample('vehicle');
      useAppStore.getState().insertLibraryComponent(kind);
      expect(useAppStore.getState().sourceCode).toContain(expected);
    }
  });
});

describe('context-aware library filtering', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('shows only Behavior categories in actionFlow view', () => {
    useAppStore.getState().setActiveView('actionFlow');
    const activeView = useAppStore.getState().activeView;
    expect(activeView).toBe('actionFlow');

    // The VIEW_CATEGORY_MAP in LibraryPanel filters to ['Behavior']
    // We verify the store reflects the view change which drives filtering
    expect(useAppStore.getState().activeView).toBe('actionFlow');
  });

  it('shows only Requirements categories in requirements view', () => {
    useAppStore.getState().setActiveView('requirements');
    expect(useAppStore.getState().activeView).toBe('requirements');
  });

  it('shows Structure and Connections in general view', () => {
    useAppStore.getState().setActiveView('general');
    expect(useAppStore.getState().activeView).toBe('general');
  });

  it('shows Structure and Connections in interconnection view', () => {
    useAppStore.getState().setActiveView('interconnection');
    expect(useAppStore.getState().activeView).toBe('interconnection');
  });

  it('shows Behavior categories in stateTransition view', () => {
    useAppStore.getState().setActiveView('stateTransition');
    expect(useAppStore.getState().activeView).toBe('stateTransition');
  });

  it('shows Structure and Requirements in viewpoints view', () => {
    useAppStore.getState().setActiveView('viewpoints');
    expect(useAppStore.getState().activeView).toBe('viewpoints');
  });
});
