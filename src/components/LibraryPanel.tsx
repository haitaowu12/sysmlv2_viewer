/**
 * Library Panel
 * Draggable templates for SysML v2 elements
 */

import { useRef } from 'react';

interface LibraryItem {
    kind: string;
    label: string;
    icon: string;
    codeTemplate: string;
}

const LIBRARY_ITEMS: LibraryItem[] = [
    // Structure
    {
        kind: 'Package',
        label: 'Package',
        icon: '📦',
        codeTemplate: "package 'NewPackage' {\n\t\n}",
    },
    {
        kind: 'PartDef',
        label: 'Part Def',
        icon: '🔷',
        codeTemplate: "part def NewPart {\n\t\n}",
    },
    {
        kind: 'PartUsage',
        label: 'Part',
        icon: '🔹',
        codeTemplate: "part newPart : PartType;",
    },
    {
        kind: 'PortDef',
        label: 'Port Def',
        icon: '🔌',
        codeTemplate: "port def NewPort;",
    },
    {
        kind: 'PortUsage',
        label: 'Port',
        icon: '🔸',
        codeTemplate: "port newPort : PortType;",
    },
    // Interfaces & Connections
    {
        kind: 'InterfaceDef',
        label: 'Interface Def',
        icon: '🔀',
        codeTemplate: "interface def NewInterface {\n\tend a;\n\tend b;\n}",
    },
    {
        kind: 'ConnectionDef',
        label: 'Connection Def',
        icon: '🔗',
        codeTemplate: "connection def NewConnection {\n\tend source;\n\tend target;\n}",
    },
    {
        kind: 'ConnectionUsage',
        label: 'Connection',
        icon: '🔗',
        codeTemplate: "connect source to target;",
    },
    // Behavior
    {
        kind: 'ActionDef',
        label: 'Action Def',
        icon: '⚡',
        codeTemplate: "action def NewAction {\n\tin input;\n\tout output;\n}",
    },
    {
        kind: 'ActionUsage',
        label: 'Action',
        icon: '⚡',
        codeTemplate: "action newAction : ActionType;",
    },
    {
        kind: 'StateDef',
        label: 'State Def',
        icon: '🔄',
        codeTemplate: "state def NewStateDef {\n\tentry; then off;\n\tstate off;\n}",
    },
    {
        kind: 'StateUsage',
        label: 'State',
        icon: '🔄',
        codeTemplate: "state newState;",
    },
    // Requirements
    {
        kind: 'RequirementDef',
        label: 'Requirement Def',
        icon: '📋',
        codeTemplate: "requirement def NewRequirement {\n\tdoc /* Description */\n}",
    },
    {
        kind: 'RequirementUsage',
        label: 'Requirement',
        icon: '📋',
        codeTemplate: "requirement newRequirement : RequirementType;",
    },
    // Constraint
    {
        kind: 'ConstraintDef',
        label: 'Constraint Def',
        icon: '🔒',
        codeTemplate: "constraint def NewConstraint {\n\t\n}",
    },
    {
        kind: 'ConstraintUsage',
        label: 'Constraint',
        icon: '🔒',
        codeTemplate: "constraint { true }",
    },
    // Viewpoints & Views
    {
        kind: 'ViewpointDef',
        label: 'Viewpoint Def',
        icon: '👁️',
        codeTemplate: "viewpoint def NewViewpoint {\n\tdoc /* Stakeholder concerns */\n\tattribute concerns : String;\n}",
    },
    {
        kind: 'ViewDef',
        label: 'View Def',
        icon: '🖼️',
        codeTemplate: "view def NewView : ViewpointType {\n\t\n}",
    },
    // Verification
    {
        kind: 'VerificationDef',
        label: 'Verification Def',
        icon: '✅',
        codeTemplate: "verification def NewVerification {\n\tsubject : SystemUnderTest;\n}",
    },
    // Analysis
    {
        kind: 'AnalysisDef',
        label: 'Analysis Def',
        icon: '📊',
        codeTemplate: "analysis def NewAnalysis {\n\t\n}",
    },
];

function LibraryItemComponent({ item }: { item: LibraryItem }) {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('application/sysml-template', item.codeTemplate);
        e.dataTransfer.setData('application/sysml-kind', item.kind);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <div
            className="library-item"
            draggable
            onDragStart={handleDragStart}
            title="Drag to diagram to add"
        >
            <span className="library-icon">{item.icon}</span>
            <span className="library-label">{item.label}</span>
            <span className="library-add">+</span>
        </div>
    );
}

export default function LibraryPanel() {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Group items by category (Structure, Behavior, Requirements) or just list them
    // For simplicity, just list them all for now, maybe grouped later

    return (
        <div className="library-panel">
            <div className="panel-header">
                <span className="panel-title">Library</span>
            </div>
            <div className="panel-content" ref={scrollRef}>
                <div className="library-grid">
                    {LIBRARY_ITEMS.map((item, i) => (
                        <LibraryItemComponent key={i} item={item} />
                    ))}
                </div>
                <div className="library-hint">
                    Drag items to the diagram or code editor to add them.
                </div>
            </div>
        </div>
    );
}
