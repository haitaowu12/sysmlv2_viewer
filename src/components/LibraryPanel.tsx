/**
 * Library Panel
 * Draggable templates for SysML v2 elements with categories, search, and recently-used tracking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronRight,
  Search,
  ArrowRightLeft,
  CircleDot,
  List,
  Hash,
  Workflow,
  Layers,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LibraryItem {
  kind: string;
  label: string;
  icon: LucideIcon;
  codeTemplate: string;
}

type CategoryKey = 'Structure' | 'Connections' | 'Behavior' | 'Requirements' | 'Recent';

interface Category {
  key: CategoryKey;
  label: string;
  items: LibraryItem[];
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const ALL_LIBRARY_ITEMS: LibraryItem[] = [
  // Structure
  { kind: 'Package', label: 'Package', icon: Package, codeTemplate: "package 'NewPackage' {\n\t\n}" },
  { kind: 'PartDef', label: 'Part Def', icon: Box, codeTemplate: 'part def NewPart {\n\t\n}' },
  { kind: 'PartUsage', label: 'Part', icon: BoxSelect, codeTemplate: 'part newPart : PartType;' },
  { kind: 'PortDef', label: 'Port Def', icon: Plug, codeTemplate: 'port def NewPort;' },
  { kind: 'PortUsage', label: 'Port', icon: Plug2, codeTemplate: 'port newPort : PortType;' },
  { kind: 'ItemDef', label: 'Item Def', icon: CircleDot, codeTemplate: 'item def NewItem;' },
  { kind: 'ItemUsage', label: 'Item', icon: CircleDot, codeTemplate: 'item newItem : ItemType;' },
  { kind: 'EnumDef', label: 'Enum Def', icon: Hash, codeTemplate: 'enum def NewEnum {\n\tVALUE_A,\n\tVALUE_B\n}' },
  { kind: 'EnumUsage', label: 'Enum', icon: Hash, codeTemplate: 'enum newEnum : NewEnum;' },

  // Connections
  { kind: 'InterfaceDef', label: 'Interface Def', icon: GitBranch, codeTemplate: 'interface def NewInterface {\n\tend a;\n\tend b;\n}' },
  { kind: 'InterfaceUsage', label: 'Interface', icon: GitBranch, codeTemplate: 'interface newInterface : InterfaceType;' },
  { kind: 'ConnectionDef', label: 'Connection Def', icon: Link, codeTemplate: 'connection def NewConnection {\n\tend source;\n\tend target;\n}' },
  { kind: 'ConnectionUsage', label: 'Connection', icon: Link2, codeTemplate: 'connect source to target;' },
  { kind: 'FlowUsage', label: 'Flow', icon: ArrowRightLeft, codeTemplate: 'flow source -> target;' },
  { kind: 'BindingUsage', label: 'Binding', icon: Link2, codeTemplate: 'bind source = target;' },

  // Behavior
  { kind: 'ActionDef', label: 'Action Def', icon: Zap, codeTemplate: 'action def NewAction {\n\tin input;\n\tout output;\n}' },
  { kind: 'ActionUsage', label: 'Action', icon: Zap, codeTemplate: 'action newAction : ActionType;' },
  { kind: 'StateDef', label: 'State Def', icon: RefreshCw, codeTemplate: 'state def NewStateDef {\n\tentry; then off;\n\tstate off;\n}' },
  { kind: 'StateUsage', label: 'State', icon: RefreshCw, codeTemplate: 'state newState;' },
  { kind: 'TransitionUsage', label: 'Transition', icon: Workflow, codeTemplate: 'transition first off accept Trigger then on;' },

  // Requirements
  { kind: 'RequirementDef', label: 'Requirement Def', icon: ClipboardList, codeTemplate: 'requirement def NewRequirement {\n\tdoc /* Description */\n}' },
  { kind: 'RequirementUsage', label: 'Requirement', icon: ClipboardList, codeTemplate: 'requirement newRequirement : RequirementType;' },
  { kind: 'ConstraintDef', label: 'Constraint Def', icon: Lock, codeTemplate: 'constraint def NewConstraint {\n\t\n}' },
  { kind: 'ConstraintUsage', label: 'Constraint', icon: Lock, codeTemplate: 'constraint { true }' },
  { kind: 'VerificationDef', label: 'Verification Def', icon: ShieldCheck, codeTemplate: 'verification def NewVerification {\n\tsubject : SystemUnderTest;\n}' },
  { kind: 'AnalysisDef', label: 'Analysis Def', icon: BarChart3, codeTemplate: 'analysis def NewAnalysis {\n\t\n}' },

  // View / Viewpoint (kept for completeness, not in a requested category)
  { kind: 'ViewpointDef', label: 'Viewpoint Def', icon: Eye, codeTemplate: 'viewpoint def NewViewpoint {\n\tdoc /* Stakeholder concerns */\n\tattribute concerns : String;\n}' },
  { kind: 'ViewDef', label: 'View Def', icon: Image, codeTemplate: 'view def NewView : ViewpointType {\n\t\n}' },
];

const CATEGORY_DEFINITIONS: Omit<Category, 'items'>[] = [
  { key: 'Structure', label: 'Structure' },
  { key: 'Connections', label: 'Connections' },
  { key: 'Behavior', label: 'Behavior' },
  { key: 'Requirements', label: 'Requirements' },
];

const RECENT_STORAGE_KEY = 'sysml-library-recent';
const MAX_RECENT_ITEMS = 5;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getCategoryForKind(kind: string): CategoryKey {
  const structureKinds = new Set([
    'Package', 'PartDef', 'PartUsage', 'PortDef', 'PortUsage',
    'ItemDef', 'ItemUsage', 'EnumDef', 'EnumUsage',
  ]);
  const connectionKinds = new Set([
    'InterfaceDef', 'InterfaceUsage', 'ConnectionDef', 'ConnectionUsage',
    'FlowUsage', 'BindingUsage',
  ]);
  const behaviorKinds = new Set([
    'ActionDef', 'ActionUsage', 'StateDef', 'StateUsage', 'TransitionUsage',
  ]);
  const requirementKinds = new Set([
    'RequirementDef', 'RequirementUsage', 'ConstraintDef', 'ConstraintUsage',
    'VerificationDef', 'AnalysisDef',
  ]);

  if (structureKinds.has(kind)) return 'Structure';
  if (connectionKinds.has(kind)) return 'Connections';
  if (behaviorKinds.has(kind)) return 'Behavior';
  if (requirementKinds.has(kind)) return 'Requirements';
  return 'Structure';
}

function readRecentKinds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT_ITEMS);
  } catch {
    // ignore corrupt storage
  }
  return [];
}

function writeRecentKinds(kinds: string[]) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(kinds.slice(0, MAX_RECENT_ITEMS)));
  } catch {
    // ignore storage errors
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function LibraryItemComponent({
  item,
  onUse,
}: {
  item: LibraryItem;
  onUse: (item: LibraryItem) => void;
}) {
  const openCreationModal = useAppStore((s) => s.openCreationModal);

  const handleDoubleClick = () => {
    openCreationModal(item.codeTemplate, item.kind);
    onUse(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCreationModal(item.codeTemplate, item.kind);
      onUse(item);
    }
  };

  const tooltip = `${item.label} (${item.kind})\n---\n${item.codeTemplate}`;

  return (
    <div
      className="library-item"
      role="button"
      tabIndex={0}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      title={tooltip}
      aria-label={`Insert ${item.label}`}
    >
      <span className="library-icon">
        <item.icon size={14} />
      </span>
      <span className="library-label">{item.label}</span>
      <span className="library-add">+</span>
    </div>
  );
}

function CategorySection({
  category,
  isOpen,
  onToggle,
  onUseItem,
}: {
  category: Category;
  isOpen: boolean;
  onToggle: () => void;
  onUseItem: (item: LibraryItem) => void;
}) {
  if (category.items.length === 0) return null;

  return (
    <div className="library-category">
      <button
        className="library-category-header"
        onClick={onToggle}
        type="button"
        aria-expanded={isOpen}
      >
        <span className="library-category-icon">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="library-category-label">{category.label}</span>
        <span className="library-category-count">{category.items.length}</span>
      </button>
      {isOpen && (
        <div className="library-grid">
          {category.items.map((item) => (
            <LibraryItemComponent key={item.kind} item={item} onUse={onUseItem} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  View-based category filtering                                      */
/* ------------------------------------------------------------------ */

import type { ViewType } from '../store/store';

const VIEW_CATEGORY_MAP: Record<ViewType, CategoryKey[] | null> = {
  general: ['Structure', 'Connections'],
  interconnection: ['Structure', 'Connections'],
  actionFlow: ['Behavior'],
  stateTransition: ['Behavior'],
  requirements: ['Requirements'],
  viewpoints: ['Structure', 'Requirements'],
  drawio: null,
  explorer: null,
};

export default function LibraryPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeView = useAppStore((s) => s.activeView);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentKinds, setRecentKinds] = useState<string[]>(readRecentKinds);
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<CategoryKey, boolean>>({
    Structure: false,
    Connections: false,
    Behavior: false,
    Requirements: false,
    Recent: false,
  });

  // Hydrate recent kinds on mount (localStorage is not available during SSR)
  useEffect(() => {
    setRecentKinds(readRecentKinds());
  }, []);

  // Auto-expand categories when searching
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const itemMatches = (item: LibraryItem) =>
      item.label.toLowerCase().includes(query) ||
      item.kind.toLowerCase().includes(query);

    const nextCollapsed: Record<CategoryKey, boolean> = { ...collapsed };

    for (const def of CATEGORY_DEFINITIONS) {
      const items = ALL_LIBRARY_ITEMS.filter(
        (item) => getCategoryForKind(item.kind) === def.key && itemMatches(item),
      );
      nextCollapsed[def.key] = items.length === 0;
    }

    const recentItems = recentKinds
      .map((kind) => ALL_LIBRARY_ITEMS.find((item) => item.kind === kind))
      .filter((item): item is LibraryItem => !!item && itemMatches(item));
    nextCollapsed.Recent = recentItems.length === 0;

    setCollapsed(nextCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleUseItem = useCallback((item: LibraryItem) => {
    setRecentKinds((prev) => {
      const next = [item.kind, ...prev.filter((k) => k !== item.kind)];
      const trimmed = next.slice(0, MAX_RECENT_ITEMS);
      writeRecentKinds(trimmed);
      return trimmed;
    });
  }, []);

  const toggleCategory = useCallback((key: CategoryKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const activeCategories = VIEW_CATEGORY_MAP[activeView];
  const isFiltering = !showAll && activeCategories !== null;

  const filteredCategories = (() => {
    const query = searchQuery.trim().toLowerCase();

    const itemMatches = (item: LibraryItem) =>
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.kind.toLowerCase().includes(query);

    const categoryAllowed = (key: CategoryKey) => {
      if (!isFiltering) return true;
      if (key === 'Recent') return true;
      return activeCategories!.includes(key);
    };

    const baseCategories: Category[] = CATEGORY_DEFINITIONS.map((def) => ({
      ...def,
      items: ALL_LIBRARY_ITEMS.filter(
        (item) =>
          getCategoryForKind(item.kind) === def.key &&
          itemMatches(item) &&
          categoryAllowed(def.key),
      ),
    }));

    const recentItems = recentKinds
      .map((kind) => ALL_LIBRARY_ITEMS.find((item) => item.kind === kind))
      .filter((item): item is LibraryItem => !!item && itemMatches(item));

    const categories: Category[] = [
      ...(recentItems.length > 0 && categoryAllowed('Recent') ? [{ key: 'Recent' as CategoryKey, label: 'Recent', items: recentItems }] : []),
      ...baseCategories,
    ];

    return categories.filter((cat) => cat.items.length > 0);
  })();

  return (
    <div className="library-panel">
      <div className="panel-header">
        <span className="panel-title">Library</span>
      </div>

      <div className="library-search-wrapper">
        <Search size={12} className="library-search-icon" />
        <input
          type="search"
          className="library-search-input"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search library items"
        />
      </div>

      {isFiltering && (
        <div className="library-filter-bar">
          <span className="library-filter-note">
            Showing items for <strong>{activeView}</strong> view
          </span>
          <button
            className="library-filter-toggle"
            onClick={() => setShowAll((v) => !v)}
            type="button"
            title="Show all library items"
          >
            <Layers size={12} />
            Show All
          </button>
        </div>
      )}

      <div className="panel-content" ref={scrollRef}>
        {filteredCategories.length === 0 ? (
          <div className="library-empty">
            <List size={20} />
            <span>No items match your search.</span>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <CategorySection
              key={category.key}
              category={category}
              isOpen={!collapsed[category.key]}
              onToggle={() => toggleCategory(category.key)}
              onUseItem={handleUseItem}
            />
          ))
        )}

        <div className="library-hint">
          Double-click items to add them to your model.
        </div>
      </div>
    </div>
  );
}
