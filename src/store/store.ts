/**
 * Application State Store (Zustand)
 */

import { create } from 'zustand';
import type { SysMLModel, SysMLNode, ParseError } from '../parser/types';
import { parseSysML } from '../parser/parser';
import { MARS_ROVER_EXAMPLE } from '../examples/marsRover';
import { RADIO_SYSTEM_EXAMPLE } from '../examples/radioSystem';
import type { LayoutMap, SemanticNodeKind, SyncPatch, SyncState } from '../bridge/semantic-types';
import { sysmlPathHash } from '../bridge/semantic-types';
import { buildSemanticModelFromSource } from '../bridge/sysml-to-semantic';
import { semanticModelToDrawioXml } from '../bridge/semantic-to-drawio';
import { parseDrawioToSemanticModel } from '../bridge/drawio-to-semantic';
import { diffSemanticModels } from '../bridge/semantic-diff';
import { applySyncPatches, semanticModelToSysmlSource } from '../bridge/semantic-to-sysml-patch';
import { semanticModelToSvg } from '../bridge/semantic-to-svg';
import { partitionSemanticModelForDrawio, type DrawioViewMode } from '../bridge/view-partition';

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
  drawioViewMode: DrawioViewMode;
  layoutMap: LayoutMap;
  syncState: SyncState;
  pendingPatchReview: SyncPatch[];
  appliedSyncPatches: SyncPatch[];

  // Undo/Redo
  history: string[];
  historyIndex: number;
  maxHistorySize: number;

  // UI state
  activeView: ViewType;
  selectedNodeId: string | null;
  selectedNode: SysMLNode | null;
  focusedNodeId: string | null;
  hiddenAttributes: Record<string, boolean>; // nodeId -> isHidden
  isDarkMode: boolean;
  showExplorer: boolean;
  showPropertyPanel: boolean;
  enableAiChat: boolean;
  enableDrawioBridge: boolean;

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
  setDrawioViewMode: (mode: DrawioViewMode) => void;
  reflowDrawioLayout: () => void;
  applyPatch: (patchId: string) => void;
  rejectPatch: (patchId: string) => void;
  applyAllPatches: () => void;
  rejectAllPatches: () => void;

  // AI apply action
  applyGeneratedModel: (payload: { sysml: string; drawioXml?: string; diagnostics?: string[] }) => void;

  // Editor Actions
  resetToExample: (exampleType?: 'vehicle' | 'mars' | 'radio') => void;
  removeSelectedNode: () => void;
  insertCode: (code: string, targetNodeId?: string) => void;
  insertLibraryComponent: (kind: string, targetNodeId?: string, customName?: string) => void;

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

  // Relationship Modal
  relationshipModal: {
    isOpen: boolean;
    sourceNodeId: string;
    targetNodeId: string;
    inferredType: string;
  } | null;
  openRelationshipModal: (sourceNodeId: string, targetNodeId: string, inferredType: string) => void;
  closeRelationshipModal: () => void;

  // Relationship creation
  createRelationship: (sourceNodeId: string, targetNodeId: string, relationshipType?: string, details?: string) => void;

  // Attribute Editing
  updateNodeAttribute: (nodeId: string, attrName: string, updates: { name?: string; type?: string; def?: string }) => void;
  addNodeAttribute: (nodeId: string, attr: { name: string; type?: string; def?: string }) => void;
  deleteNodeAttribute: (nodeId: string, attrName: string) => void;

  // Property Editing
  updateNodeProperty: (nodeId: string, property: string, value: string) => void;
  updateNodeDoc: (nodeId: string, doc: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
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
const INITIAL_DRAWIO_VIEW_MODE: DrawioViewMode = 'general';
const INITIAL_DRAWIO_SEMANTIC = partitionSemanticModelForDrawio(INITIAL_SEMANTIC, INITIAL_DRAWIO_VIEW_MODE, INITIAL_SEMANTIC.layout);
const INITIAL_SOURCE_HASH = sysmlPathHash(DEMO_CODE);
const INITIAL_DRAWIO_XML = semanticModelToDrawioXml(INITIAL_DRAWIO_SEMANTIC);

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

function toDrawioViewMode(view: ViewType): DrawioViewMode {
  if (view === 'requirements') return 'requirements';
  if (view === 'interconnection') return 'interconnection';
  return 'general';
}

function defaultNodeKindForView(view: DrawioViewMode): SemanticNodeKind {
  if (view === 'requirements') return 'RequirementDef';
  if (view === 'verification') return 'VerificationDef';
  if (view === 'interconnection') return 'PartUsage';
  if (view === 'all') return 'PartUsage';
  return 'PartDef';
}

function pushToHistory(state: { history: string[]; historyIndex: number; maxHistorySize: number; sourceCode: string }): { history: string[]; historyIndex: number } {
  const { history, historyIndex, maxHistorySize, sourceCode } = state;
  const newHistory = history.slice(0, historyIndex + 1);
  newHistory.push(sourceCode);
  if (newHistory.length > maxHistorySize) {
    newHistory.shift();
    return { history: newHistory, historyIndex: newHistory.length - 1 };
  }
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

export const useAppStore = create<AppState>((set, get) => ({
  sourceCode: DEMO_CODE,
  model: INITIAL_MODEL,
  parseErrors: INITIAL_MODEL.errors,
  drawioXml: INITIAL_DRAWIO_XML,
  drawioViewMode: INITIAL_DRAWIO_VIEW_MODE,
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
  history: [DEMO_CODE],
  historyIndex: 0,
  maxHistorySize: 50,
  activeView: 'general',
  selectedNodeId: null,
  selectedNode: null,
  focusedNodeId: null,
  hiddenAttributes: {},
  creationModal: null,
  relationshipModal: null,
  isDarkMode: true,
  showExplorer: true,
  showPropertyPanel: true,
  enableAiChat: import.meta.env.VITE_ENABLE_AI_CHAT !== 'false',
  enableDrawioBridge: import.meta.env.VITE_ENABLE_DRAWIO_BRIDGE !== 'false',
  fileName: null,
  currentModelId: 'vehicle',
  isModified: false,

  setSourceCode: (code) => {
    const state = get();
    const hist = pushToHistory(state);
    set({ sourceCode: code, isModified: true, ...hist });
  },

  parseSource: () => {
    const { sourceCode, selectedNode } = get();
    try {
      const model = parseSysML(sourceCode);
      const newSelectedNode = refreshModelSelection(model, selectedNode);
      set({ model, parseErrors: model.errors, selectedNode: newSelectedNode });

      get().syncFromSysml();
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

  setActiveView: (view) => {
    const { activeView } = get();
    const next: Partial<AppState> = { activeView: view };

    if (view === 'drawio' && activeView !== 'drawio') {
      next.drawioViewMode = toDrawioViewMode(activeView);
    }

    set(next as Pick<AppState, 'activeView'> & Partial<AppState>);
    if (view === 'drawio') {
      get().syncFromSysml();
    }
  },

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
          drawioViewMode: 'all',
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
    const { drawioXml, sourceCode, layoutMap, drawioViewMode } = get();
    if (drawioXml.trim()) return drawioXml;
    const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
    const scoped = partitionSemanticModelForDrawio(semantic, drawioViewMode, layoutMap);
    return semanticModelToDrawioXml(scoped);
  },

  exportSvg: () => {
    const { sourceCode, layoutMap, drawioViewMode } = get();
    const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
    const scoped = partitionSemanticModelForDrawio(semantic, drawioViewMode, layoutMap);
    return semanticModelToSvg(scoped);
  },

  setModified: (v) => set({ isModified: v }),

  syncFromSysml: () => {
    const { sourceCode, layoutMap, drawioViewMode } = get();
    try {
      const semantic = buildSemanticModelFromSource(sourceCode, layoutMap);
      const scoped = partitionSemanticModelForDrawio(semantic, drawioViewMode, layoutMap);
      const drawioXml = semanticModelToDrawioXml(scoped);
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
      const fullSemantic = buildSemanticModelFromSource(state.sourceCode, state.layoutMap);
      const currentSemantic = partitionSemanticModelForDrawio(
        fullSemantic,
        state.drawioViewMode,
        state.layoutMap,
      );
      const incomingSemantic = parseDrawioToSemanticModel(xml, {
        defaultNodeKind: defaultNodeKindForView(state.drawioViewMode),
      });
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

      let hist: { history: string[]; historyIndex: number } | undefined;
      if (!conflict && safePatches.length > 0) {
        hist = pushToHistory(state);
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
        ...(hist || {}),
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

  setDrawioViewMode: (mode) => {
    set({ drawioViewMode: mode });
    get().syncFromSysml();
  },

  reflowDrawioLayout: () => {
    const { sourceCode, drawioViewMode } = get();
    try {
      const semantic = buildSemanticModelFromSource(sourceCode, {});
      const scoped = partitionSemanticModelForDrawio(semantic, drawioViewMode, {});
      const drawioXml = semanticModelToDrawioXml(scoped);
      const sourceHash = sysmlPathHash(sourceCode);
      set((state) => ({
        drawioXml,
        layoutMap: semantic.layout,
        syncState: {
          ...state.syncState,
          sourceHash,
          drawioSnapshotHash: sourceHash,
          lastSyncedAt: new Date().toISOString(),
          diagnostics: ['Layout reflow applied using semantic graph layout.'],
          conflict: undefined,
        },
      }));
    } catch (error) {
      set((state) => ({
        syncState: {
          ...state.syncState,
          conflict: 'Layout reflow failed.',
          diagnostics: [`Reflow error: ${(error as Error).message}`],
        },
      }));
    }
  },

  applyPatch: (patchId) => {
    const state = get();
    const patch = state.pendingPatchReview.find((item) => item.id === patchId);
    if (!patch) return;

    const hist = pushToHistory(state);
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
      ...hist,
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

  applyAllPatches: () => {
    const state = get();
    if (state.pendingPatchReview.length === 0) return;

    const hist = pushToHistory(state);
    const forcedSafe = state.pendingPatchReview.map((patch) => ({ ...patch, safety: 'safe' as const }));
    const patchResult = applySyncPatches(state.sourceCode, forcedSafe);
    const nextSource = patchResult.sourceCode;
    const model = parseSysML(nextSource);
    const nextHash = sysmlPathHash(nextSource);
    const newSelectedNode = refreshModelSelection(model, state.selectedNode);

    set((prev) => ({
      sourceCode: nextSource,
      model,
      parseErrors: model.errors,
      selectedNode: newSelectedNode,
      pendingPatchReview: dedupePatches(patchResult.reviewPatches),
      appliedSyncPatches: [...prev.appliedSyncPatches, ...patchResult.appliedPatches],
      syncState: {
        ...prev.syncState,
        diagnostics: patchResult.diagnostics,
        conflict: undefined,
        sourceHash: nextHash,
        drawioSnapshotHash: nextHash,
        lastSyncedAt: new Date().toISOString(),
      },
      isModified: true,
      ...hist,
    }));

    if (model.errors.length === 0) {
      get().syncFromSysml();
    }
  },

  rejectAllPatches: () => {
    set((state) => ({
      pendingPatchReview: [],
      syncState: {
        ...state.syncState,
        diagnostics: ['All pending review patches were rejected.'],
        conflict: undefined,
        lastSyncedAt: new Date().toISOString(),
      },
    }));
  },

  applyGeneratedModel: ({ sysml, drawioXml, diagnostics = [] }) => {
    const state = get();
    const hist = pushToHistory(state);
    const currentMode = state.drawioViewMode;
    let resolvedDrawio = drawioXml ?? '';
    let layout = { ...state.layoutMap };

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
      const scoped = partitionSemanticModelForDrawio(semantic, currentMode, layout);
      resolvedDrawio = semanticModelToDrawioXml(scoped);
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
      ...hist,
    });

    if (model.errors.length === 0) {
      get().syncFromSysml();
    }
  },

  resetToExample: (exampleType = 'vehicle') => {
    const currentMode = get().drawioViewMode;
    let code = DEMO_CODE;
    if (exampleType === 'mars') code = MARS_ROVER_EXAMPLE;
    if (exampleType === 'radio') code = RADIO_SYSTEM_EXAMPLE;

    const model = parseSysML(code);
    const semantic = buildSemanticModelFromSource(code);
    const scoped = partitionSemanticModelForDrawio(semantic, currentMode, semantic.layout);
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
      drawioXml: semanticModelToDrawioXml(scoped),
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

    const hist = pushToHistory(get());
    const { start, end } = selectedNode.location;
    const newCode = sourceCode.slice(0, start.offset) + sourceCode.slice(end.offset);

    set({ sourceCode: newCode, selectedNode: null, selectedNodeId: null, isModified: true, ...hist });
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

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
  },

  insertLibraryComponent: (kind: string, targetNodeId?: string, customName?: string) => {
    const { sourceCode, model } = get();
    if (!model) return;

    // Collect all existing names to ensure uniqueness
    const existingNames = new Set<string>();
    function collectNames(nodes: SysMLNode[]) {
      for (const node of nodes) {
        existingNames.add(node.name);
        collectNames(node.children);
      }
    }
    collectNames(model.children);

    // Generate a unique name
    const baseName = customName || kind.replace(/\s+/g, '');
    let name = baseName;
    let counter = 1;
    while (existingNames.has(name)) {
      name = `${baseName}_${counter}`;
      counter++;
    }

    // Build the SysML template based on kind
    const templates: Record<string, string> = {
      'part def': `part def ${name} {\n\t\n}`,
      'part': `part ${name} : PartType;`,
      'port def': `port def ${name};`,
      'port': `port ${name} : PortType;`,
      'action def': `action def ${name} {\n\tin input : ScalarValue;\n\tout output : ScalarValue;\n}`,
      'action': `action ${name} : ActionType;`,
      'state def': `state def ${name} {\n\tentry; then idle;\n\tstate idle;\n}`,
      'state': `state ${name};`,
      'requirement def': `requirement def ${name} {\n\tdoc /* Description of ${name} */\n}`,
      'requirement': `requirement ${name} : RequirementType;`,
      'package': `package '${name}' {\n\t\n}`,
      'attribute': `attribute ${name} : ScalarValue;`,
      'connection': `connect a to b;`,
      'interface': `interface def ${name} {\n\tend p1 : Port;\n\tend p2 : Port;\n}`,
      'item def': `item def ${name};`,
      'item': `item ${name} : ItemType;`,
      'enum def': `enum def ${name} {\n\tVALUE_A,\n\tVALUE_B\n}`,
      'enum': `enum ${name} : EnumType;`,
      'constraint def': `constraint def ${name};`,
      'constraint': `constraint { true }`,
      'verification def': `verification def ${name} {\n\tsubject : SystemUnderTest;\n}`,
      'analysis def': `analysis def ${name};`,
      'flow': `flow from source to target;`,
      'binding': `bind source = target;`,
      'transition': `transition first source accept Trigger then target;`,
      'dependency': `dependency ${name} from source to target;`,
      'satisfy': `satisfy RequirementName;`,
      'viewpoint def': `viewpoint def ${name} {\n\tdoc /* Stakeholder concerns */\n}`,
      'view def': `view def ${name} : ViewpointType;`,
    };

    const template = templates[kind] || `${kind} ${name};`;

    const definitionKinds = new Set(['part def', 'port def', 'action def', 'state def', 'requirement def', 'constraint def', 'item def', 'enum def', 'interface', 'connection def', 'verification def', 'analysis def', 'viewpoint def', 'view def', 'package']);

    if (targetNodeId) {
      const foundTarget = findNodeById(model.children, targetNodeId);
      if (foundTarget) {
        const targetKind = foundTarget.kind;
        if (definitionKinds.has(kind) && targetKind !== 'Package') {
          window.dispatchEvent(new CustomEvent('sysml-toast', {
            detail: { message: `Cannot place a definition inside ${targetKind}. Definitions belong at package level.`, type: 'error' },
          }));
          return;
        }
        if (kind === 'package' && targetKind !== 'Package') {
          window.dispatchEvent(new CustomEvent('sysml-toast', {
            detail: { message: `Packages can only be nested inside other packages.`, type: 'error' },
          }));
          return;
        }
      }
    }

    // Scope detection
    let targetNode: SysMLNode | null = null;
    if (targetNodeId) {
      const found = findNodeById(model.children, targetNodeId);
      if (found && (found.kind === 'Package' || found.kind.endsWith('Def'))) {
        targetNode = found;
      }
    }

    // If no valid target, find the first package in the model
    if (!targetNode) {
      for (const child of model.children) {
        if (child.kind === 'Package') {
          targetNode = child;
          break;
        }
      }
    }

    let newCode = sourceCode;
    if (targetNode && targetNode.location) {
      const insertPos = targetNode.location.end.offset - 1;
      newCode = sourceCode.slice(0, insertPos) + '\n\t' + template + '\n' + sourceCode.slice(insertPos);
    } else {
      newCode += '\n\n' + template;
    }

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
    get().syncFromSysml();
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

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
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

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
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

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
  },

  updateNodeProperty: (nodeId, property, value) => {
    const { sourceCode, model } = get();
    if (!model) return;
    const node = findNodeById(model.children, nodeId);
    if (!node || !node.location) return;

    const { start, end } = node.location;
    const nodeSource = sourceCode.slice(start.offset, end.offset);
    let newNodeSource = nodeSource;

    switch (property) {
      case 'name': {
        const nameRegex = new RegExp(`\\b${node.name}\\b`);
        newNodeSource = nodeSource.replace(nameRegex, value);
        break;
      }
      case 'multiplicity': {
        const multPattern = /\[[^\]]*\]/;
        const newMult = value.startsWith('[') && value.endsWith(']') ? value : `[${value}]`;
        if (multPattern.test(nodeSource)) {
          newNodeSource = nodeSource.replace(multPattern, newMult);
        } else {
          newNodeSource = nodeSource.replace(new RegExp(`(\\b${node.name}\\b)`), `$1${newMult}`);
        }
        break;
      }
      case 'direction': {
        const dirPattern = /\b(in|out|inout)\b/;
        if (dirPattern.test(nodeSource)) {
          newNodeSource = nodeSource.replace(dirPattern, value);
        } else {
          newNodeSource = `${value} ${nodeSource}`;
        }
        break;
      }
      case 'visibility': {
        const visPattern = /\b(public|private|protected)\b/;
        if (visPattern.test(nodeSource)) {
          newNodeSource = nodeSource.replace(visPattern, value);
        } else {
          newNodeSource = `${value} ${nodeSource}`;
        }
        break;
      }
      case 'defaultValue': {
        const defPattern = /=\s*([^;]+)/;
        if (defPattern.test(nodeSource)) {
          newNodeSource = nodeSource.replace(defPattern, `= ${value}`);
        } else {
          newNodeSource = nodeSource.replace(/;/, ` = ${value};`);
        }
        break;
      }
      default:
        return;
    }

    const newCode = sourceCode.slice(0, start.offset) + newNodeSource + sourceCode.slice(end.offset);
    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
  },

  updateNodeDoc: (nodeId, doc) => {
    const { sourceCode, model } = get();
    if (!model) return;
    const node = findNodeById(model.children, nodeId);
    if (!node || !node.location) return;

    const docNode = node.children.find((c) => c.kind === 'Doc') as { location?: { start: { offset: number }; end: { offset: number } }; text?: string } | undefined;

    const end = node.location.end;
    let newCode: string;

    if (docNode && docNode.location) {
      const docStart = docNode.location.start.offset;
      const docEnd = docNode.location.end.offset;
      const newDoc = `doc /* ${doc} */`;
      newCode = sourceCode.slice(0, docStart) + newDoc + sourceCode.slice(docEnd);
    } else {
      const newDoc = `\n\tdoc /* ${doc} */`;
      const insertPos = end.offset - 1;
      newCode = sourceCode.slice(0, insertPos) + newDoc + sourceCode.slice(insertPos);
    }

    const hist = pushToHistory(get());
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
  },

  openCreationModal: (template, kind, targetId) => {
    set({ creationModal: { isOpen: true, template, kind, targetId } });
  },

  closeCreationModal: () => {
    set({ creationModal: null });
  },

  openRelationshipModal: (sourceNodeId, targetNodeId, inferredType) => {
    set({ relationshipModal: { isOpen: true, sourceNodeId, targetNodeId, inferredType } });
  },

  closeRelationshipModal: () => {
    set({ relationshipModal: null });
  },

  createRelationship: (sourceNodeId, targetNodeId, relationshipType, details) => {
    const { sourceCode, model } = get();
    if (!model) return;

    const sourceNode = findNodeById(model.children, sourceNodeId);
    const targetNode = findNodeById(model.children, targetNodeId);
    if (!sourceNode || !targetNode) return;

    const sourceKind = sourceNode.kind;
    const targetKind = targetNode.kind;

    const inferRelationshipType = (): string => {
      if (relationshipType) return relationshipType;
      if (sourceKind === 'PartDef' && targetKind === 'PartDef') return 'part';
      if (sourceKind === 'StateUsage' && targetKind === 'StateUsage') return 'transition';
      if (sourceKind === 'StateDef' && targetKind === 'StateDef') return 'transition';
      if ((sourceKind === 'RequirementDef' || sourceKind === 'RequirementUsage') && (targetKind === 'PartDef' || targetKind === 'PartUsage')) return 'satisfy';
      if ((sourceKind === 'ActionDef' || sourceKind === 'ActionUsage') && (targetKind === 'ActionDef' || targetKind === 'ActionUsage')) return 'flow';
      if ((sourceKind === 'PortDef' || sourceKind === 'PortUsage') && (targetKind === 'PortDef' || targetKind === 'PortUsage')) return 'connect';
      if ((sourceKind === 'PartDef' || sourceKind === 'PartUsage') && (targetKind === 'PortDef' || targetKind === 'PortUsage')) return 'port';
      return 'dependency';
    };

    const relType = inferRelationshipType();
    let codeToInsert = '';

    switch (relType) {
      case 'part': {
        codeToInsert = `\tpart ${targetNode.name.toLowerCase()} : ${targetNode.name};\n`;
        break;
      }
      case 'transition': {
        const trigger = details || 'Trigger';
        codeToInsert = `\ttransition ${sourceNode.name}_to_${targetNode.name}\n\t\tfirst ${sourceNode.name}\n\t\taccept ${trigger}\n\t\tthen ${targetNode.name};\n`;
        break;
      }
      case 'satisfy': {
        codeToInsert = `\tsatisfy ${targetNode.name};\n`;
        break;
      }
      case 'flow': {
        codeToInsert = `\tflow from ${sourceNode.name} to ${targetNode.name};\n`;
        break;
      }
      case 'bind': {
        codeToInsert = `\tbind ${sourceNode.name} = ${targetNode.name};\n`;
        break;
      }
      case 'connect': {
        codeToInsert = `\tconnect ${sourceNode.name} to ${targetNode.name};\n`;
        break;
      }
      case 'port': {
        codeToInsert = `\tport ${targetNode.name.toLowerCase()} : ${targetNode.name};\n`;
        break;
      }
      default: {
        codeToInsert = `\tdependency ${sourceNode.name}_to_${targetNode.name} from ${sourceNode.name} to ${targetNode.name};\n`;
      }
    }

    let newCode = sourceCode;
    if (sourceNode.location) {
      const insertPos = sourceNode.location.end.offset - 1;
      newCode = sourceCode.slice(0, insertPos) + '\n' + codeToInsert + sourceCode.slice(insertPos);
    } else {
      newCode += '\n\n' + codeToInsert;
    }

    const hist = pushToHistory(get());
    const parseResult = parseSysML(newCode);
    if (parseResult.errors.length > 0) {
      window.dispatchEvent(new CustomEvent('sysml-toast', { detail: { message: 'Warning: generated code has parse errors', type: 'warning' } }));
    }
    set({ sourceCode: newCode, isModified: true, ...hist });
    get().parseSource();
    get().syncFromSysml();
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const restoredCode = history[newIndex];
    set({ sourceCode: restoredCode, historyIndex: newIndex, isModified: true });
    get().parseSource();
    get().syncFromSysml();
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const restoredCode = history[newIndex];
    set({ sourceCode: restoredCode, historyIndex: newIndex, isModified: true });
    get().parseSource();
    get().syncFromSysml();
  },

  canUndo: () => {
    return get().historyIndex > 0;
  },

  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },
}));
