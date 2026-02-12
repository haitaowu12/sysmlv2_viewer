/**
 * Reusable Context Menu Component
 */
import { useEffect, useRef } from 'react';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    children: React.ReactNode;
}

export default function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Use timeout to avoid immediate close from the triggering click
        setTimeout(() => window.addEventListener('click', handleClick), 0);
        return () => window.removeEventListener('click', handleClick);
    }, [onClose]);

    // Adjust position to keep in viewport (basic)
    const style: React.CSSProperties = {
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 2000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        borderRadius: '6px',
        padding: '4px 0',
        boxShadow: 'var(--shadow-md)',
        minWidth: '160px',
    };

    return (
        <div ref={ref} style={style}>
            {children}
        </div>
    );
}

export function MenuItem({ onClick, children, icon }: { onClick: () => void; children: React.ReactNode; icon?: string }) {
    return (
        <div
            className="ctx-menu-item"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', gap: '8px', alignItems: 'center' }}
        >
            {icon && <span>{icon}</span>}
            <span>{children}</span>
        </div>
    );
}
