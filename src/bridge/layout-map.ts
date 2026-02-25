import type { LayoutMap, SemanticModel } from './semantic-types';

const GRID_WIDTH = 4;
const START_X = 40;
const START_Y = 40;
const STEP_X = 240;
const STEP_Y = 130;

const DEFAULT_WIDTH: Record<string, number> = {
  Package: 240,
  PartDef: 220,
  PartUsage: 220,
  PortDef: 180,
  PortUsage: 180,
  ConnectionUsage: 200,
  RequirementDef: 260,
  RequirementUsage: 240,
  VerificationDef: 220,
  VerificationUsage: 220,
  Unknown: 220,
};

const DEFAULT_HEIGHT: Record<string, number> = {
  Package: 120,
  PartDef: 90,
  PartUsage: 90,
  PortDef: 70,
  PortUsage: 70,
  ConnectionUsage: 70,
  RequirementDef: 110,
  RequirementUsage: 100,
  VerificationDef: 90,
  VerificationUsage: 90,
  Unknown: 90,
};

export function buildDefaultLayout(model: SemanticModel, previous: LayoutMap = {}): LayoutMap {
  const layout: LayoutMap = { ...previous };

  model.nodes.forEach((node, index) => {
    if (layout[node.id]) {
      return;
    }

    const col = index % GRID_WIDTH;
    const row = Math.floor(index / GRID_WIDTH);

    layout[node.id] = {
      x: START_X + col * STEP_X,
      y: START_Y + row * STEP_Y,
      width: DEFAULT_WIDTH[node.kind] ?? 220,
      height: DEFAULT_HEIGHT[node.kind] ?? 90,
    };
  });

  return layout;
}
