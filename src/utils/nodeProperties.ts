import type { SysMLNode } from '../parser/types';

export interface NodeProperties {
  concerns?: string[];
  defaultValue?: string;
  direction?: 'in' | 'out' | 'inout';
  expression?: string;
  isParallel?: boolean;
  isRedefine?: boolean;
  multiplicity?: string;
  about?: string;
  payloadType?: string;
  source?: string;
  sourceRef?: string;
  snapshotOf?: string;
  subsets?: string;
  superTypes?: string[];
  target?: string;
  targetRef?: string;
  text?: string;
  timeSliceOf?: string;
  trigger?: string;
  typeName?: string;
  variantOf?: string;
  viewpoint?: string;
}

export function nodeProperties(node: SysMLNode): SysMLNode & NodeProperties {
  return node as SysMLNode & NodeProperties;
}

export function hasNodeProperty<K extends keyof NodeProperties>(
  node: SysMLNode,
  key: K,
): node is SysMLNode & Required<Pick<NodeProperties, K>> {
  return nodeProperties(node)[key] !== undefined;
}
