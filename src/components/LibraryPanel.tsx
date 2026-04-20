/**
 * Library Panel
 * Draggable templates for SysML v2 elements
 */

import { useRef } from 'react';
import { useAppStore } from '../store/store';
import type { LucideIcon } from 'lucide-react';
import {
  Package,
  Box,
  BoxSelect,
  Plug,
  Plug2,
  GitBranch,
  Link,
  Link2,
  Zap,
  RefreshCw,
  ClipboardList,
  Lock,
  Eye,
  Image,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

interface LibraryItem {
    kind: string;
    label: string;
    icon: LucideIcon;
    codeTemplate: string;
}

const LIBRARY_ITEMS: LibraryItem[] = [
    {
        kind: 'Package',
        label: 'Package',
        icon: Package,
        codeTemplate: "package 'NewPackage' {\n\t\n}",
    },
    {
        kind: 'PartDef',
        label: 'Part Def',
        icon: Box,
        codeTemplate: "part def NewPart {\n\t\n}",
    },
    {
        kind: 'PartUsage',
        label: 'Part',
        icon: BoxSelect,
        codeTemplate: "part newPart : PartType;",
    },
    {
        kind: 'PortDef',
        label: 'Port Def',
        icon: Plug,
        codeTemplate: "port def NewPort;",
    },
    {
        kind: 'PortUsage',
        label: 'Port',
        icon: Plug2,
        codeTemplate: "port newPort : PortType;",
    },
    {
        kind: 'InterfaceDef',
        label: 'Interface Def',
        icon: GitBranch,
        codeTemplate: "interface def NewInterface {\n\tend a;\n\tend b;\n}",
    },
    {
        kind: 'ConnectionDef',
        label: 'Connection Def',
        icon: Link,
        codeTemplate: "connection def NewConnection {\n\tend source;\n\tend target;\n}",
    },
    {
        kind: 'ConnectionUsage',
        label: 'Connection',
        icon: Link2,
        codeTemplate: "connect source to target;",
    },
    {
        kind: 'ActionDef',
        label: 'Action Def',
        icon: Zap,
        codeTemplate: "action def NewAction {\n\tin input;\n\tout output;\n}",
    },
    {
        kind: 'ActionUsage',
        label: 'Action',
        icon: Zap,
        codeTemplate: "action newAction : ActionType;",
    },
    {
        kind: 'StateDef',
        label: 'State Def',
        icon: RefreshCw,
        codeTemplate: "state def NewStateDef {\n\tentry; then off;\n\tstate off;\n}",
    },
    {
        kind: 'StateUsage',
        label: 'State',
        icon: RefreshCw,
        codeTemplate: "state newState;",
    },
    {
        kind: 'RequirementDef',
        label: 'Requirement Def',
        icon: ClipboardList,
        codeTemplate: "requirement def NewRequirement {\n\tdoc /* Description */\n}",
    },
    {
        kind: 'RequirementUsage',
        label: 'Requirement',
        icon: ClipboardList,
        codeTemplate: "requirement newRequirement : RequirementType;",
    },
    {
        kind: 'ConstraintDef',
        label: 'Constraint Def',
        icon: Lock,
        codeTemplate: "constraint def NewConstraint {\n\t\n}",
    },
    {
        kind: 'ConstraintUsage',
        label: 'Constraint',
        icon: Lock,
        codeTemplate: "constraint { true }",
    },
    {
        kind: 'ViewpointDef',
        label: 'Viewpoint Def',
        icon: Eye,
        codeTemplate: "viewpoint def NewViewpoint {\n\tdoc /* Stakeholder concerns */\n\tattribute concerns : String;\n}",
    },
    {
        kind: 'ViewDef',
        label: 'View Def',
        icon: Image,
        codeTemplate: "view def NewView : ViewpointType {\n\t\n}",
    },
    {
        kind: 'VerificationDef',
        label: 'Verification Def',
        icon: ShieldCheck,
        codeTemplate: "verification def NewVerification {\n\tsubject : SystemUnderTest;\n}",
    },
    {
        kind: 'AnalysisDef',
        label: 'Analysis Def',
        icon: BarChart3,
        codeTemplate: "analysis def NewAnalysis {\n\t\n}",
    },
];

function LibraryItemComponent({ item }: { item: LibraryItem }) {
    const openCreationModal = useAppStore((s) => s.openCreationModal);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('application/sysml-template', item.codeTemplate);
        e.dataTransfer.setData('application/sysml-kind', item.kind);
        e.dataTransfer.effectAllowed = 'copy';
        window.dispatchEvent(
            new CustomEvent('sysml-library-drag-start', {
                detail: {
                    kind: item.kind,
                    template: item.codeTemplate,
                },
            }),
        );
    };

    const handleDragEnd = () => {
        window.dispatchEvent(new CustomEvent('sysml-library-drag-end'));
    };

    return (
        <div
            className="library-item"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDoubleClick={() => openCreationModal(item.codeTemplate, item.kind)}
            title="Drag to diagram/editor or double-click to create"
        >
            <span className="library-icon"><item.icon size={14} /></span>
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
