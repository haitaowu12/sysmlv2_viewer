import {
  Box,
  Link,
  Zap,
  RefreshCw,
  ClipboardList,
  Eye,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  viewType?:
    | 'general'
    | 'interconnection'
    | 'actionFlow'
    | 'stateTransition'
    | 'requirements'
    | 'viewpoints'
    | 'drawio';
}

const viewIcons: Record<string, LucideIcon> = {
  general: Box,
  interconnection: Link,
  actionFlow: Zap,
  stateTransition: RefreshCw,
  requirements: ClipboardList,
  viewpoints: Eye,
  drawio: Puzzle,
};

export default function EmptyState({ title, description, action, viewType }: EmptyStateProps) {
  const Icon = viewType ? viewIcons[viewType] || Box : Box;

  return (
    <div className="empty-state">
      <div className="empty-state-icon-wrapper">
        <Icon size={48} strokeWidth={1.2} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && (
        <button className="btn btn-ghost" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
