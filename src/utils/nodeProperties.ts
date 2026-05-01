import type { SysMLNode } from '../parser/types';

export interface NodeProperties {
  concerns?: string[];
  defaultValue?: string;
  direction?: 'in' | 'out' | 'inout';
  expression?: string;
  isParallel?: boolean;
  isRedefine?: boolean;
  multiplicity?: string;
  source?: string;
  subsets?: string;
  superTypes?: string[];
  target?: string;
  text?: string;
  trigger?: string;
  typeName?: string;
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
