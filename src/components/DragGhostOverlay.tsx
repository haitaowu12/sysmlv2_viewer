/**
 * DragGhostOverlay
 * Renders a translucent preview of a library item following the cursor during drag operations.
 */

import { useEffect, useState } from 'react';
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
  ArrowRightLeft,
  CircleDot,
  Hash,
  Workflow,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Icon map for library kinds                                         */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, LucideIcon> = {
  Package,
  PartDef: Box,
  PartUsage: BoxSelect,
  PortDef: Plug,
  PortUsage: Plug2,
  ItemDef: CircleDot,
  ItemUsage: CircleDot,
  EnumDef: Hash,
  EnumUsage: Hash,
  InterfaceDef: GitBranch,
  InterfaceUsage: GitBranch,
  ConnectionDef: Link,
  ConnectionUsage: Link2,
  FlowUsage: ArrowRightLeft,
  BindingUsage: Link2,
  ActionDef: Zap,
  ActionUsage: Zap,
  StateDef: RefreshCw,
  StateUsage: RefreshCw,
  TransitionUsage: Workflow,
  RequirementDef: ClipboardList,
  RequirementUsage: ClipboardList,
  ConstraintDef: Lock,
  ConstraintUsage: Lock,
  VerificationDef: ShieldCheck,
  AnalysisDef: BarChart3,
  ViewpointDef: Eye,
  ViewDef: Image,
};

interface DragInfo {
  kind: string;
  label: string;
  template: string;
}

export default function DragGhostOverlay() {
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<DragInfo>).detail;
      if (detail) {
        setDragInfo(detail);
      }
    };

    const onEnd = () => {
      setDragInfo(null);
    };

    const onMove = (e: MouseEvent) => {
      if (dragInfo) {
        setPosition({ x: e.clientX, y: e.clientY });
      }
    };

    window.addEventListener('sysml-library-drag-start', onStart as EventListener);
    window.addEventListener('sysml-library-drag-end', onEnd);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('mousemove', onMove);

    return () => {
      window.removeEventListener('sysml-library-drag-start', onStart as EventListener);
      window.removeEventListener('sysml-library-drag-end', onEnd);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('mousemove', onMove);
    };
  }, [dragInfo]);

  if (!dragInfo) return null;

  const Icon = ICON_MAP[dragInfo.kind] || Box;

  return (
    <div
      className="drag-ghost"
      style={{
        position: 'fixed',
        left: position.x + 12,
        top: position.y + 12,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div className="drag-ghost-inner">
        <span className="drag-ghost-icon">
          <Icon size={18} />
        </span>
        <span className="drag-ghost-label">{dragInfo.label}</span>
      </div>
    </div>
  );
}
