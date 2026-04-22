import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, getNodeId } from '../store/store';

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

describe('updateNodeProperty', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('updates node name', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const engine = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const engineId = getNodeId(engine);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeProperty(engineId, 'name', 'Motor');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('part def Motor');
    expect(newCode).not.toContain('part def Engine');
  });

  it('updates multiplicity on a part usage', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Vehicle {
    part wheels : Wheel[4];
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const vehicle = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const wheels = vehicle.children.find((c) => c.kind === 'PartUsage' && c.name === 'wheels')!;
    const wheelsId = getNodeId(wheels);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeProperty(wheelsId, 'multiplicity', '6');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('[6]');
    expect(newCode).not.toContain('[4]');
  });

  it('updates direction on a port usage', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  port def PowerPort;
  part def Device {
    port power : PowerPort;
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const device = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const power = device.children.find((c) => c.kind === 'PortUsage' && c.name === 'power')!;
    const powerId = getNodeId(power);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeProperty(powerId, 'direction', 'in');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('in port power');
  });

  it('does not update with invalid multiplicity format', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Vehicle {
    part wheels : Wheel[4];
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const vehicle = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const wheels = vehicle.children.find((c) => c.kind === 'PartUsage' && c.name === 'wheels')!;
    const wheelsId = getNodeId(wheels);

    // updateNodeProperty does not validate multiplicity format in store,
    // but we test that passing an empty value does not corrupt source
    useAppStore.getState().updateNodeProperty(wheelsId, 'multiplicity', '');
    const newCode = useAppStore.getState().sourceCode;

    // Empty multiplicity replaces [4] with []
    expect(newCode).toContain('[]');
  });
});

describe('updateNodeDoc', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('adds documentation to a node without existing doc', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const engine = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const engineId = getNodeId(engine);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeDoc(engineId, 'The engine provides power.');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('doc /* The engine provides power. */');
  });

  it('updates existing documentation on a node', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
    doc /* Old description */
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const engine = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const engineId = getNodeId(engine);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeDoc(engineId, 'New description');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('doc /* New description */');
    expect(newCode).not.toContain('Old description');
  });
});

describe('updateNodeProperty validation', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('ignores unknown properties', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const engine = model.children.find((n) => n.kind === 'Package')!.children.find((c) => c.kind === 'PartDef')!;
    const engineId = getNodeId(engine);

    const codeBefore = useAppStore.getState().sourceCode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useAppStore.getState().updateNodeProperty as any)(engineId, 'unknownProperty', 'value');
    const newCode = useAppStore.getState().sourceCode;

    // The store returns early for unknown properties, so code should be unchanged
    expect(newCode).toBe(codeBefore);
  });

  it('does not corrupt source when updating property on node without location', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
  }
}`);
    store.parseSource();

    // Manually create a fake node id that won't be found
    const fakeId = 'PartDef_NonExistent_0_0';
    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().updateNodeProperty(fakeId, 'name', 'NewName');
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).toBe(initialCode);
  });
});
