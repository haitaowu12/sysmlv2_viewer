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

describe('createRelationship store action', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAppStore.getState().resetToExample('vehicle');
  });

  it('creates a part relationship between two PartDef nodes', () => {
    const store = useAppStore.getState();
    const model = store.model!;

    // Find two PartDef nodes
    const partDefs = model.children.flatMap((n) =>
      n.kind === 'Package'
        ? n.children.filter((c) => c.kind === 'PartDef')
        : n.kind === 'PartDef' ? [n] : []
    );

    expect(partDefs.length).toBeGreaterThanOrEqual(2);
    const source = partDefs[0];
    const target = partDefs[1];
    const sourceId = getNodeId(source);
    const targetId = getNodeId(target);

    const initialCode = store.sourceCode;
    store.createRelationship(sourceId, targetId);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('part ');
    expect(newCode).toContain(target.name);
  });

  it('creates a transition relationship between two State nodes', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`state def VehicleStates {
  state parked;
  state idle;
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const stateDef = model.children.find((n) => n.kind === 'StateDef')!;
    const states = stateDef.children.filter((c) => c.kind === 'StateUsage');

    expect(states.length).toBeGreaterThanOrEqual(2);
    const sourceId = getNodeId(states[0]);
    const targetId = getNodeId(states[1]);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().createRelationship(sourceId, targetId);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('transition');
    expect(newCode).toContain('first ' + states[0].name);
    expect(newCode).toContain('then ' + states[1].name);
  });

  it('creates a satisfy relationship from RequirementDef to PartDef', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  requirement def MassReq {
    doc /* Mass limit */
  }
  part def Vehicle {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const pkg = model.children.find((n) => n.kind === 'Package')!;
    const req = pkg.children.find((c) => c.kind === 'RequirementDef')!;
    const part = pkg.children.find((c) => c.kind === 'PartDef')!;

    const reqId = getNodeId(req);
    const partId = getNodeId(part);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().createRelationship(reqId, partId);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('satisfy');
    expect(newCode).toContain(req.name);
  });

  it('updates source code after relationship creation', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  part def Engine {
  }
  part def Transmission {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const pkg = model.children.find((n) => n.kind === 'Package')!;
    const engine = pkg.children.find((c) => c.kind === 'PartDef' && c.name === 'Engine')!;
    const transmission = pkg.children.find((c) => c.kind === 'PartDef' && c.name === 'Transmission')!;

    const engineId = getNodeId(engine);
    const transmissionId = getNodeId(transmission);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().createRelationship(engineId, transmissionId);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    // The relationship should be inserted inside the source node
    expect(newCode.length).toBeGreaterThan(initialCode.length);
  });

  it('infers dependency relationship for unknown node combinations', () => {
    const store = useAppStore.getState();
    store.setSourceCode(`package Test {
  item def Fuel {
  }
  item def Battery {
  }
}`);
    store.parseSource();

    const model = useAppStore.getState().model!;
    const pkg = model.children.find((n) => n.kind === 'Package')!;
    const fuel = pkg.children.find((c) => c.kind === 'ItemDef' && c.name === 'Fuel')!;
    const battery = pkg.children.find((c) => c.kind === 'ItemDef' && c.name === 'Battery')!;

    const fuelId = getNodeId(fuel);
    const batteryId = getNodeId(battery);

    const initialCode = useAppStore.getState().sourceCode;
    useAppStore.getState().createRelationship(fuelId, batteryId);
    const newCode = useAppStore.getState().sourceCode;

    expect(newCode).not.toBe(initialCode);
    expect(newCode).toContain('dependency');
  });
});
