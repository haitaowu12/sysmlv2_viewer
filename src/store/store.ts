/**
 * Application State Store (Zustand)
 */

import { create } from 'zustand';
import type { SysMLModel, SysMLNode, ParseError } from '../parser/types';
import { parseSysML } from '../parser/parser';
import { MARS_ROVER_EXAMPLE } from '../examples/marsRover';
import { RADIO_SYSTEM_EXAMPLE } from '../examples/radioSystem';
import type { LayoutMap, SyncPatch, SyncState } from '../bridge/semantic-types';
import { sysmlPathHash } from '../bridge/semantic-types';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import { semanticModelToDrawioXml } from '../bridge/semantic-to-drawio';
import { parseDrawioToSemanticModel } from '../bridge/drawio-to-semantic';
import { diffSemanticModels } from '../bridge/semantic-diff';
import { applySyncPatches, semanticModelToSysmlSource } from '../bridge/semantic-to-sysml-patch';
import { semanticModelToSvg } from '../bridge/semantic-to-svg';

export type ViewType =
  | 'general'
  | 'interconnection'
  | 'actionFlow'
  | 'stateTransition'
  | 'requirements'
  | 'viewpoints'
  | 'drawio'
  | 'explorer';

export interface AppState {
  // Source code
  sourceCode: string;

  // Parsed model
  model: SysMLModel | null;
  parseErrors: ParseError[];

  // Sync state
  drawioXml: string;
  layoutMap: LayoutMap;
  syncState: SyncState;
  pendingPatchReview: SyncPatch[];
  appliedSyncPatches: SyncPatch[];

  // UI state
  activeView: ViewType;
  selectedNodeId: string | null;
  selectedNode: SysMLNode | null;
  focusedNodeId: string | null;
  hiddenAttributes: Record<string, boolean>; // nodeId -> isHidden
  isDarkMode: boolean;
  showExplorer: boolean;
  showPropertyPanel: boolean;

  // File state
  fileName: string | null;
  currentModelId: string; // 'vehicle' | 'mars' | 'radio' | 'custom'
  isModified: boolean;

  // Actions
  setSourceCode: (code: string) => void;
  parseSource: () => void;
  setActiveView: (view: ViewType) => void;
  selectNode: (nodeId: string | null, node?: SysMLNode | null) => void;
  toggleDarkMode: () => void;
  toggleExplorer: () => void;
  togglePropertyPanel: () => void;
  loadFile: (name: string, content: string) => void;
  exportSysML: () => string;
  exportDrawio: () => string;
  exportSvg: () => string;
  setModified: (v: boolean) => void;

  // Sync actions
  syncFromSysml: () => void;
  syncFromDrawio: (xml: string) => void;
  setDrawioXml: (xml: string) => void;
  applyPatch: (patchId: string) => void;
  rejectPatch: (patchId: string) => void;

  // AI apply action
  applyGeneratedModel: (payload: { sysml: string; drawioXml?: string; diagnostics?: string[] }) => void;

  // Editor Actions
  resetToExample: (exampleType?: 'vehicle' | 'mars' | 'radio') => void;
  removeSelectedNode: () => void;
  insertCode: (code: string, targetNodeId?: string) => void;

  // Advanced UI Actions
  setFocusedNode: (nodeId: string | null) => void;
  toggleAttributeVisibility: (nodeId: string) => void;

  // Creation Modal
  creationModal: {
    isOpen: boolean;
    template: string;
    targetId?: string;
    kind: string; // 'part', 'action', 'package', etc.
  } | null;
  openCreationModal: (template: string, kind: string, targetId?: string) => void;
  closeCreationModal: () => void;

  // Attribute Editing
  updateNodeAttribute: (nodeId: string, attrName: string, updates: { name?: string; type?: string; def?: string }) => void;
  addNodeAttribute: (nodeId: string, attr: { name: string; type?: string; def?: string }) => void;
  deleteNodeAttribute: (nodeId: string, attrName: string) => void;
}

const DEMO_CODE = `package 'Vehicle System' {
	
	// Part Definitions
	part def Vehicle {
		part eng : Engine;
		part trans : Transmission;
		part body : Body;
	}
	
	part def Engine {
		part cyl : Cylinder[4..6];
		attribute horsePower : Integer;
	}
	
	part def Transmission;
	part def Body;
	part def Cylinder;
	
	// Port Definitions
	port def FuelPort;
	port def DrivePort;
	
	// Action Definitions
	action def StartEngine {
		in ignitionSignal : Boolean;
		out engineRunning : Boolean;
	}
	
	action def Accelerate {
		in throttle : Real;
		out speed : Real;
	}
	
	// State Definition
	state def VehicleStates {
		entry; then parked;
		
		state parked;
		
		transition park_to_idle
			first parked
			accept StartSignal
			then idle;
		
		state idle;
		
		transition idle_to_moving
			first idle
			accept AccelerateSignal
			then moving;
		
		state moving;
		
		transition moving_to_idle
			first moving
			accept BrakeSignal
			then idle;
	}
	
	// Requirements
	requirement def VehicleMassRequirement {
		doc /* The total vehicle mass shall not exceed 2000 kg. */
		attribute massLimit : Real;
	}
	
	requirement def SafetyRequirement {
		doc /* The vehicle shall meet all applicable safety standards. */
	}
	
	// Usages
	part myCar : Vehicle {
		satisfy VehicleMassRequirement;
		satisfy SafetyRequirement;
		
		part redefines eng {
			part redefines cyl[4];
		}
	}
	
	test case CarMassVerification {
		subject myCar;
		verify VehicleMassRequirement;
	}
}
`;

const INITIAL_MODEL = parseSysML(DEMO_CODE);
const INITIAL_SEMANTIC = buildSemanticModelFromSource(DEMO_CODE);
const INITIAL_SOURCE_HASH = sysmlPathHash(DEMO_CODE);
const INITIAL_DRAWIO_XML = semanticModelToDrawioXml(INITIAL_SEMANTIC);

function findNodeById(nodes: SysMLNode[], id: string): SysMLNode | null {
  for (const node of nodes) {
    const nodeId = getNodeId(node);
    if (nodeId === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function dedupePatches(patches: SyncPatch[]): SyncPatch[] {
  const byId = new Map<string, SyncPatch>();
  for (const patch of patches) {
    byId.set(patch.id, patch);
  }
  return Array.from(byId.values());
}

function refreshModelSelection(model: SysMLModel, selectedNode: SysMLNode | null): SysMLNode | null {
  if (!selectedNode) return null;
  return findNodeById(model.children, getNodeId(selectedNode));
}

export function getNodeId(node: SysMLNode): string {
  if (node.location) {
    return `${node.kind}_${node.name}_${node.location.start.line}_${node.location.start.column}`;
  }
  return `${node.kind}_${node.name}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  sourceCode: DEMO_CODE,
  model: INITIAL_MODEL,
  parseErrors: INITIAL_MODEL.errors,
  drawioXml: INITIAL_DRAWIO_XML,
  layoutMap: INITIAL_SEMANTIC.layout,
  syncState: {
    isSyncing: false,
    sourceHash: INITIAL_SOURCE_HASH,
    drawioSnapshotHash: INITIAL_SOURCE_HASH,
    lastSyncedAt: new Date().toISOString(),
    diagnostics: [],
  },
  pendingPatchReview: [],
  appliedSyncPatches: [],
  activeView: 'general',
  selectedNodeId: null,
  selectedNode: null,
  focusedNodeId: null,
  hiddenAttributes: {},
  creationModal: null,
  isDarkMode: true,
  showExplorer: true,
  showPropertyPanel: true,
  fileName: null,
  currentModelId: 'vehicle',
  isModified: false,

  setSourceCode: (code) => {
    set({ sourceCode: code, isModified: true });
  },

  parseSource: () => {
    const { sourceCode, selectedNode } = get();
    try {
      const model = parseSysML(sourceCode);
      const newSelectedNode = refreshModelSelection(model, selectedNode);
      set({ model, parseErrors: model.errors, selectedNode: newSelectedNode });

      if (model.errors.length === 0) {
        get().syncFromSysml();
      }
    } catch (e) {
      set({
        parseErrors: [
          {
            message: (e as Error).message,
          },
        ],
        model: null,
        selectedNode: null,
      });
    }
  },

  setActiveView: (view) => set({ activeView: view }),

  selectNode: (nodeId, node) => {
    if (nodeId === null) {
      set({ selectedNodeId: null, selectedNode: null });
      return;
    }

    if (node) {
      set({ selectedNodeId: nodeId, selectedNode: node });
      return;
    }

    const { model } = get();
    if (model) {
      const found = findNodeById(model.children, nodeId);
      set({ selectedNodeId: nodeId, selectedNode: found || null });
    } else {
      set({ selectedNodeId: nodeId, selectedNode: null });
    }
  },

  toggleDarkMode: () => set((s) => ({ isDarkMode: !s.isDarkMode })),
  toggleExplorer: () => set((s) => ({ showExplorer: !s.showExplorer })),
  togglePropertyPanel: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel })),

  loadFile: (name, content) => {
    const lowered = name.toLowerCase();

    if (lowered.endsWith('.drawio')) {
      try {
        const semantic = parseDrawioToSemanticModel(content);
        const sysml = semanticModelToSysmlSource(semantic);
        const model = parseSysML(sysml);
        const sourceHash = sysmlPathHash(sysml);

        set({
          sourceCode: sysml,
          model,
          parseErrors: model.errors,
          selectedNode: null,
          selectedNodeId: null,
          fileName: name,
          currentModelId: 'custom',
          isModified: false,
          drawioXml: content,
          layoutMap: { ...semantic.layout },
          pendingPatchReview: [],
          appliedSyncPatches: [],
          syncState: {
            isSyncing: false,
            sourceHash,
            drawioSnapshotHash: sourceHash,
            lastSyncedAt: new Date().toISOString(),
            diagnostics: [],
          },
        });

        if (model.errors.length === 0) {
          get().syncFromSysml();
        }
      } catch (error) {
        set((state) => ({
          syncState: {
            ...state.syncState,
            diagnostics: [`Draw.io import failed: ${(error as Error).message}`],
            conflict: 'Draw.io XML could not be translated to SysML.',
          },
        }));
      }

      return;
    }

    set({
      sourceCode: content,
      fileName: name,
      currentModelId: 'custom',
      isModified: false,
      pendingPatchReview: [],
      appliedSyncPatches: [],
    });

    const model = parseSysML(content);
    set({ model, parseErrors: model.errors, selectedNode: null, selectedNodeId: null });

    if (model.errors.length === 0) {
      get().syncFromSysml();
    }
  },

  exportSysML: () => {
    const { sourceCode } = get();
    return sourceCode;
  },

  exportDrawio: () => {
    const { drawioXml, sourceCode, layoutMap } = get();
    if (drawioXml.trim()) return drawioXml;
    const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
    return semanticModelToDrawioXml(semantic);
  },

  exportSvg: () => {
    const { sourceCode, layoutMap } = get();
    const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
    return semanticModelToSvg(semantic);
  },

  setModified: (v) => set({ isModified: v }),

  syncFromSysml: () => {
    const { sourceCode, layoutMap } = get();
    try {
      const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
      const drawioXml = semanticModelToDrawioXml(semantic);
      const sourceHash = sysmlPathHash(sourceCode);

      set((state) => ({
        drawioXml,
        layoutMap: semantic.layout,
        syncState: {
          ...state.syncState,
          isSyncing: false,
          sourceHash,
          drawioSnapshotHash: sourceHash,
          lastSyncedAt: new Date().toISOString(),
          conflict: undefined,
          diagnostics: [],
        },
      }));
    } catch (error) {
      set((state) => ({
        syncState: {
          ...state.syncState,
          conflict: 'SysML-to-Draw.io synchronization failed.',
          diagnostics: [`Sync error: ${(error as Error).message}`],
        },
      }));
    }
  },

  syncFromDrawio: (xml) => {
    const state = get();
    const currentSourceHash = sysmlPathHash(state.sourceCode);

    let conflict: string | undefined;
    if (state.syncState.drawioSnapshotHash && state.syncState.drawioSnapshotHash !== currentSourceHash) {
      conflict = 'Source changed after Draw.io snapshot. Review is required before applying canvas edits.';
    }

    try {
      const currentSemantic = buildSemanticModelFromSource(state.sourceCode, state.layoutMap);
      const incomingSemantic = parseDrawioToSemanticModel(xml);
      const diff = diffSemanticModels(currentSemantic, incomingSemantic);

      let candidatePatches = diff.patches;
      if (conflict) {
        candidatePatches = candidatePatches.map((patch) => ({ ...patch, safety: 'review_required' as const }));
      }

      const safePatches = candidatePatches.filter((patch) => patch.safety === 'safe');
      const reviewPatches = candidatePatches.filter((patch) => patch.safety === 'review_required');

      let nextSource = state.sourceCode;
      let appliedPatches: SyncPatch[] = [];
      const diagnostics: string[] = [];
      const queuedReviewPatches: SyncPatch[] = [...state.pendingPatchReview, ...reviewPatches];

      if (!conflict && safePatches.length > 0) {
        const patchResult = applySyncPatches(nextSource, safePatches);
        nextSource = patchResult.sourceCode;
        appliedPatches = patchResult.appliedPatches;
        queuedReviewPatches.push(...patchResult.reviewPatches);
        diagnostics.push(...patchResult.diagnostics);
      }

      const nextHash = sysmlPathHash(nextSource);
      const model = parseSysML(nextSource);
      const newSelectedNode = refreshModelSelection(model, state.selectedNode);

      set((prev) => ({
        sourceCode: nextSource,
        model,
        parseErrors: model.errors,
        selectedNode: newSelectedNode,
        isModified: prev.isModified || nextSource !== state.sourceCode,
        drawioXml: xml,
        layoutMap: {
          ...prev.layoutMap,
          ...incomingSemantic.layout,
        },
        pendingPatchReview: dedupePatches(queuedReviewPatches),
        appliedSyncPatches: [...prev.appliedSyncPatches, ...appliedPatches],
        syncState: {
          ...prev.syncState,
          isSyncing: false,
          sourceHash: nextHash,
          drawioSnapshotHash: conflict ? prev.syncState.drawioSnapshotHash : nextHash,
          conflict,
          diagnostics,
          lastSyncedAt: new Date().toISOString(),
        },
      }));

      if (!conflict && nextSource !== state.sourceCode && model.errors.length === 0) {
        get().syncFromSysml();
      }
    } catch (error) {
      set((prev) => ({
        syncState: {
          ...prev.syncState,
          conflict: 'Draw.io-to-SysML synchronization failed.',
          diagnostics: [`Sync error: ${(error as Error).message}`],
          lastSyncedAt: new Date().toISOString(),
        },
      }));
    }
  },

  setDrawioXml: (xml) => set({ drawioXml: xml }),

  applyPatch: (patchId) => {
    const state = get();
    const patch = state.pendingPatchReview.find((item) => item.id === patchId);
    if (!patch) return;

    const patchResult = applySyncPatches(state.sourceCode, [{ ...patch, safety: 'safe' }]);
    const nextSource = patchResult.sourceCode;
    const model = parseSysML(nextSource);

    set((prev) => ({
      sourceCode: nextSource,
      model,
      parseErrors: model.errors,
      pendingPatchReview: dedupePatches(
        prev.pendingPatchReview.filter((candidate) => candidate.id !== patchId).concat(patchResult.reviewPatches),
      ),
      appliedSyncPatches: [...prev.appliedSyncPatches, ...patchResult.appliedPatches],
      syncState: {
        ...prev.syncState,
        diagnostics: patchResult.diagnostics,
        conflict: undefined,
        sourceHash: sysmlPathHash(nextSource),
        lastSyncedAt: new Date().toISOString(),
      },
      isModified: true,
    }));

    if (model.errors.length === 0) {
      get().syncFromSysml();
    }
  },

  rejectPatch: (patchId) => {
    set((state) => ({
      pendingPatchReview: state.pendingPatchReview.filter((patch) => patch.id !== patchId),
    }));
  },

  applyGeneratedModel: ({ sysml, drawioXml, diagnostics = [] }) => {
    let resolvedDrawio = drawioXml ?? '';
    let layout = { ...get().layoutMap };

    if (resolvedDrawio) {
      try {
        const parsedDrawio = parseDrawioToSemanticModel(resolvedDrawio);
        layout = { ...layout, ...parsedDrawio.layout };
      } catch {
        // Fallback to generated draw.io below.
      }
    }

    if (!resolvedDrawio) {
      const semantic = buildSemanticModelFromSource(sysml, layout);
      resolvedDrawio = semanticModelToDrawioXml(semantic);
      layout = semantic.layout;
    }

    const model = parseSysML(sysml);
    const sourceHash = sysmlPathHash(sysml);

    set({
      sourceCode: sysml,
      model,
      parseErrors: model.errors,
      drawioXml: resolvedDrawio,
      layoutMap: layout,
      pendingPatchReview: [],
      appliedSyncPatches: [],
      isModified: true,
      syncState: {
        isSyncing: false,
        sourceHash,
        drawioSnapshotHash: sourceHash,
        diagnostics,
        lastSyncedAt: new Date().toISOString(),
      },
    });

    if (model.errors.length === 0) {
      get().syncFromSysml();
    }
  },

  resetToExample: (exampleType = 'vehicle') => {
    let code = DEMO_CODE;
    if (exampleType === 'mars') code = MARS_ROVER_EXAMPLE;
    if (exampleType === 'radio') code = RADIO_SYSTEM_EXAMPLE;

    const model = parseSysML(code);
    const semantic = buildSemanticModelFromSource(code);
    const sourceHash = sysmlPathHash(code);

    set({
      sourceCode: code,
      model,
      parseErrors: model.errors,
      fileName: null,
      currentModelId: exampleType,
      isModified: false,
      selectedNode: null,
      selectedNodeId: null,
      drawioXml: semanticModelToDrawioXml(semantic),
      layoutMap: semantic.layout,
      pendingPatchReview: [],
      appliedSyncPatches: [],
      syncState: {
        isSyncing: false,
        sourceHash,
        drawioSnapshotHash: sourceHash,
        diagnostics: [],
        lastSyncedAt: new Date().toISOString(),
      },
    });
  },

  removeSelectedNode: () => {
    const { sourceCode, selectedNode } = get();
    if (!selectedNode || !selectedNode.location) return;

    const { start, end } = selectedNode.location;
    const newCode = sourceCode.slice(0, start.offset) + sourceCode.slice(end.offset);

    set({ sourceCode: newCode, selectedNode: null, selectedNodeId: null, isModified: true });
    get().parseSource();
  },

  insertCode: (template: string, targetNodeId?: string) => {
    const { sourceCode, selectedNode, model } = get();

    let targetNode = selectedNode;
    if (targetNodeId && model) {
      const found = findNodeById(model.children, targetNodeId);
      if (found) targetNode = found;
    }

    let newCode = sourceCode;
    if (targetNode && (targetNode.kind === 'Package' || targetNode.kind.endsWith('Def'))) {
      if (targetNode.location) {
        const insertPos = targetNode.location.end.offset - 1;
        newCode = sourceCode.slice(0, insertPos) + '\n\t' + template + '\n' + sourceCode.slice(insertPos);
      } else {
        newCode += '\n\n' + template;
      }
    } else {
      newCode += '\n\n' + template;
    }

    set({ sourceCode: newCode, isModified: true });
    get().parseSource();
  },

  setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),

  toggleAttributeVisibility: (nodeId) =>
    set((state) => ({
      hiddenAttributes: {
        ...state.hiddenAttributes,
        [nodeId]: !state.hiddenAttributes[nodeId],
      },
    })),

  updateNodeAttribute: (nodeId, attrName, updates) => {
    const { sourceCode, model } = get();
    if (!model) return;
    const node = findNodeById(model.children, nodeId);
    if (!node) return;

    const attrNode = node.children.find((c) => c.kind === 'AttributeUsage' && c.name === attrName);
    if (!attrNode || !attrNode.location) return;

    const newName = updates.name || attrNode.name;
    const currentType = (attrNode as unknown as { typeName?: string }).typeName || '';
    const newType = updates.type !== undefined ? updates.type : currentType;

    const currentDef = (attrNode as unknown as { defaultValue?: string }).defaultValue || '';
    const newDef = updates.def !== undefined ? updates.def : currentDef;

    let newLine = `attribute ${newName}`;
    if (newType) newLine += ` : ${newType}`;
    if (newDef) newLine += ` = ${newDef}`;
    newLine += ';';

    const { start, end } = attrNode.location;
    const newCode = sourceCode.slice(0, start.offset) + newLine + sourceCode.slice(end.offset);

    set({ sourceCode: newCode, isModified: true });
    get().parseSource();
  },

  addNodeAttribute: (nodeId, attr) => {
    const { sourceCode, model } = get();
    if (!model) return;
    const node = findNodeById(model.children, nodeId);
    if (!node || !node.location) return;

    const newLine = `\n\tattribute ${attr.name}${attr.type ? ' : ' + attr.type : ''}${attr.def ? ' = ' + attr.def : ''};`;

    const insertPos = node.location.end.offset - 1;
    const newCode = sourceCode.slice(0, insertPos) + newLine + sourceCode.slice(insertPos);

    set({ sourceCode: newCode, isModified: true });
    get().parseSource();
  },

  deleteNodeAttribute: (nodeId, attrName) => {
    const { sourceCode, model } = get();
    if (!model) return;
    const node = findNodeById(model.children, nodeId);
    if (!node) return;

    const attrNode = node.children.find((c) => c.kind === 'AttributeUsage' && c.name === attrName);
    if (!attrNode || !attrNode.location) return;

    const { start, end } = attrNode.location;
    const newCode = sourceCode.slice(0, start.offset) + sourceCode.slice(end.offset);

    set({ sourceCode: newCode, isModified: true });
    get().parseSource();
  },

  openCreationModal: (template, kind, targetId) => {
    set({ creationModal: { isOpen: true, template, kind, targetId } });
  },

  closeCreationModal: () => {
    set({ creationModal: null });
  },
}));
