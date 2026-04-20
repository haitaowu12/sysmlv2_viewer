import { useEffect } from 'react';
import { X } from 'lucide-react';

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: '⌘/Ctrl + Z', action: 'Undo' },
  { keys: '⌘/Ctrl + Shift + Z', action: 'Redo' },
  { keys: '⌘/Ctrl + B', action: 'Toggle Explorer' },
  { keys: '⌘/Ctrl + J', action: 'Toggle Properties' },
  { keys: '⌘/Ctrl + Shift + D', action: 'Open Draw.io Bridge' },
  { keys: '⌘/Ctrl + Shift + I', action: 'Open AI Chat' },
  { keys: '⌘/Ctrl + /', action: 'Show Keyboard Shortcuts' },
  { keys: 'Delete / Backspace', action: 'Delete Selected Node' },
  { keys: 'Escape', action: 'Clear Focus / Close Modal' },
];

export default function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="shortcuts-list">
          {shortcuts.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <kbd className="shortcut-keys">{s.keys}</kbd>
              <span className="shortcut-action">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
