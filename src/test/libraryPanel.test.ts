import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/store';

// Mock localStorage for recent-items tracking
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

describe('insertLibraryComponent store action', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('detects scope and inserts into a Package when no target is provided', () => {
    const store = useAppStore.getState();
    const initialCode = store.sourceCode;
    store.insertLibraryComponent('part def');
    const newCode = useAppStore.getState().sourceCode;
    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('part def partdef');
  });

  it('generates a unique name when a duplicate exists', () => {
    const store = useAppStore.getState();
    store.resetToExample('vehicle');
    // Vehicle example already contains 'Vehicle' part def
    store.insertLibraryComponent('part def', undefined, 'Vehicle');
    const code = useAppStore.getState().sourceCode;
    expect(code).toContain('part def Vehicle_1');
  });

  it('pushes history entry on insert', () => {
    const store = useAppStore.getState();
    store.resetToExample('vehicle');
    const beforeIndex = store.historyIndex;
    store.insertLibraryComponent('package');
    const newStore = useAppStore.getState();
    expect(newStore.historyIndex).toBe(beforeIndex + 1);
    expect(newStore.canUndo()).toBe(true);
  });

  it('inserts into target node when targetNodeId is a Package', () => {
    const store = useAppStore.getState();
    store.resetToExample('vehicle');
    const model = useAppStore.getState().model!;
    const pkg = model.children.find((n) => n.kind === 'Package')!;
    const targetId = `Package_${pkg.name}_${pkg.location!.start.line}_${pkg.location!.start.column}`;
    store.insertLibraryComponent('action def', targetId);
    const code = useAppStore.getState().sourceCode;
    expect(code).toContain('action def actiondef');
  });
});

describe('library drop integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('updates source code when a library component is inserted', () => {
    const store = useAppStore.getState();
    const initialCode = store.sourceCode;
    store.insertLibraryComponent('requirement def');
    const newCode = useAppStore.getState().sourceCode;
    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('requirement def requirementdef');
  });

  it('updates parsed model after insertion', () => {
    const store = useAppStore.getState();
    store.insertLibraryComponent('port def');
    const model = useAppStore.getState().model;
    expect(model).not.toBeNull();
    // The port def is inserted inside the package, so search recursively
    function findKind(nodes: import('../parser/types').SysMLNode[], kind: string): boolean {
      for (const n of nodes) {
        if (n.kind === kind) return true;
        if (findKind(n.children, kind)) return true;
      }
      return false;
    }
    expect(findKind(model!.children, 'PortDef')).toBe(true);
  });
});
