/**
 * Application State Store (Zustand)
 */

import { create } from 'zustand';
import type { SysMLModel, SysMLNode, ParseError } from '../parser/types';
import { parseSysML } from '../parser/parser';
import { MARS_ROVER_EXAMPLE } from '../examples/marsRover';
import { RADIO_SYSTEM_EXAMPLE } from '../examples/radioSystem';

export type ViewType = 'general' | 'interconnection' | 'actionFlow' | 'stateTransition' | 'requirements' | 'explorer';

export interface AppState {
    // Source code
    sourceCode: string;

    // Parsed model
    model: SysMLModel | null;
    parseErrors: ParseError[];

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
    setModified: (v: boolean) => void;

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
\t
\t// Part Definitions
\tpart def Vehicle {
\t\tpart eng : Engine;
\t\tpart trans : Transmission;
\t\tpart body : Body;
\t}
\t
\tpart def Engine {
\t\tpart cyl : Cylinder[4..6];
\t\tattribute horsePower : Integer;
\t}
\t
\tpart def Transmission;
\tpart def Body;
\tpart def Cylinder;
\t
\t// Port Definitions
\tport def FuelPort;
\tport def DrivePort;
\t
\t// Action Definitions
\taction def StartEngine {
\t\tin ignitionSignal : Boolean;
\t\tout engineRunning : Boolean;
\t}
\t
\taction def Accelerate {
\t\tin throttle : Real;
\t\tout speed : Real;
\t}
\t
\t// State Definition
\tstate def VehicleStates {
\t\tentry; then parked;
\t\t
\t\tstate parked;
\t\t
\t\ttransition park_to_idle
\t\t\tfirst parked
\t\t\taccept StartSignal
\t\t\tthen idle;
\t\t
\t\tstate idle;
\t\t
\t\ttransition idle_to_moving
\t\t\tfirst idle
\t\t\taccept AccelerateSignal
\t\t\tthen moving;
\t\t
\t\tstate moving;
\t\t
\t\ttransition moving_to_idle
\t\t\tfirst moving
\t\t\taccept BrakeSignal
\t\t\tthen idle;
\t}
\t
\t// Requirements
\trequirement def VehicleMassRequirement {
\t\tdoc /* The total vehicle mass shall not exceed 2000 kg. */
\t\tattribute massLimit : Real;
\t}
\t
\trequirement def SafetyRequirement {
\t\tdoc /* The vehicle shall meet all applicable safety standards. */
\t}
\t
\t// Usages
\tpart myCar : Vehicle {
\t\tsatisfy VehicleMassRequirement;
\t\tsatisfy SafetyRequirement;
\t\t
\t\tpart redefines eng {
\t\t\tpart redefines cyl[4];
\t\t}
\t}
\t
\ttest case CarMassVerification {
\t\tsubject myCar;
\t\tverify VehicleMassRequirement;
\t}
}
`;

function findNodeById(nodes: SysMLNode[], id: string): SysMLNode | null {
    for (const node of nodes) {
        const nodeId = getNodeId(node);
        if (nodeId === id) return node;
        const found = findNodeById(node.children, id);
        if (found) return found;
    }
    return null;
}

export function getNodeId(node: SysMLNode): string {
    if (node.location) {
        return `${node.kind}_${node.name}_${node.location.start.line}_${node.location.start.column}`;
    }
    return `${node.kind}_${node.name}`;
}

export const useAppStore = create<AppState>((set, get) => ({
    sourceCode: DEMO_CODE,
    model: null,
    parseErrors: [],
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
    isModified: false,

    setSourceCode: (code) => {
        set({ sourceCode: code, isModified: true });
    },

    parseSource: () => {
        const { sourceCode, selectedNode } = get();
        try {
            const model = parseSysML(sourceCode);
            let newSelectedNode: SysMLNode | null = null;
            if (selectedNode && model) {
                // Try to re-select the node if it still exists after parsing
                newSelectedNode = findNodeById(model.children, getNodeId(selectedNode));
            }
            set({ model, parseErrors: model.errors, selectedNode: newSelectedNode });
        } catch (e) {
            set({
                parseErrors: [{
                    message: (e as Error).message,
                }],
                model: null, // Clear model on parse error
                selectedNode: null, // Clear selected node on parse error
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

        // Try to find node by ID in the model
        const { model } = get();
        if (model) {
            const found = findNodeById(model.children, nodeId);
            set({ selectedNodeId: nodeId, selectedNode: found || null });
        } else {
            set({ selectedNodeId: nodeId, selectedNode: null });
        }
    },

    toggleDarkMode: () => set(s => ({ isDarkMode: !s.isDarkMode })),
    toggleExplorer: () => set(s => ({ showExplorer: !s.showExplorer })),
    togglePropertyPanel: () => set(s => ({ showPropertyPanel: !s.showPropertyPanel })),

    loadFile: (name, content) => {
        set({ sourceCode: content, fileName: name, isModified: false });
        // Auto-parse
        const model = parseSysML(content);
        set({ model, parseErrors: model.errors, selectedNode: null });
    },

    exportSysML: () => {
        const { sourceCode } = get();
        return sourceCode;
    },

    setModified: (v) => set({ isModified: v }),

    resetToExample: (exampleType = 'vehicle') => {
        let code = DEMO_CODE;
        if (exampleType === 'mars') code = MARS_ROVER_EXAMPLE;
        if (exampleType === 'radio') code = RADIO_SYSTEM_EXAMPLE;
        set({ sourceCode: code, fileName: null, isModified: false });
        get().parseSource();
    },

    removeSelectedNode: () => {
        const { sourceCode, selectedNode } = get();
        if (!selectedNode || !selectedNode.location) return;

        const { start, end } = selectedNode.location;
        // Naive removal: cut out the range
        // TODO: Handle trailing newline cleaning
        const newCode = sourceCode.slice(0, start.offset) + sourceCode.slice(end.offset);

        set({ sourceCode: newCode, selectedNode: null, isModified: true });
        get().parseSource();
    },

    insertCode: (template: string, targetNodeId?: string) => {
        const { sourceCode, selectedNode, model } = get();

        // Determine target node: passed ID > selected node > null
        let targetNode = selectedNode;
        if (targetNodeId && model) {
            const found = findNodeById(model.children, targetNodeId);
            if (found) targetNode = found;
        }

        let newCode = sourceCode;
        // If a container (Package, PartDef) is targeted, insert inside it
        if (targetNode && (targetNode.kind === 'Package' || targetNode.kind.endsWith('Def'))) {
            if (targetNode.location) {
                // Insert before the closing brace '}'
                // Insert at end.offset - 1
                const insertPos = targetNode.location.end.offset - 1;
                newCode = sourceCode.slice(0, insertPos) + '\n\t' + template + '\n' + sourceCode.slice(insertPos);
            } else {
                newCode += '\n\n' + template;
            }
        } else {
            // Append to end
            newCode += '\n\n' + template;
        }

        set({ sourceCode: newCode, isModified: true });
        get().parseSource();
    },

    setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),

    toggleAttributeVisibility: (nodeId) => set(state => ({
        hiddenAttributes: {
            ...state.hiddenAttributes,
            [nodeId]: !state.hiddenAttributes[nodeId]
        }
    })),

    updateNodeAttribute: (nodeId, attrName, updates) => {
        const { sourceCode, model } = get();
        if (!model) return;
        const node = findNodeById(model.children, nodeId);
        if (!node) return;

        // Find the attribute child
        const attrNode = node.children.find(c => c.kind === 'AttributeUsage' && c.name === attrName);
        if (!attrNode || !attrNode.location) return;

        // Construct new line
        // Assuming format: attribute <name> : <type> = <default>;
        // We need to preserve indentation if possible, or just generate standard one.
        // We can check original text?
        // Let's generate standard: 'attribute name : type = def;'

        // Use existing values if not updated
        // For type and default, we need to extract them from the AST if not in updates.
        // But AST for AttributeUsage in this detailed way is in `attrNode`.
        // attrNode has `typeName` (from PartUsage? No AttributeUsage uses PartUsage interface in my types?)
        // Let's check `types.ts`. AttributeUsage extends ItemUsage -> PartUsage.
        // It has `typeName`, `defaultValue`.

        const newName = updates.name || attrNode.name;
        // @ts-ignore
        const currentType = attrNode.typeName || '';
        const newType = updates.type !== undefined ? updates.type : currentType;

        // @ts-ignore
        const currentDef = attrNode.defaultValue || '';
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

        // Insert at end of node block
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

        const attrNode = node.children.find(c => c.kind === 'AttributeUsage' && c.name === attrName);
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
    }
}));
