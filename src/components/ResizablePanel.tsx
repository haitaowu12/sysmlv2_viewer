import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ResizablePanelProps {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
  persistKey: string;
  children: ReactNode;
  onResize?: (width: number) => void;
}

export default function ResizablePanel({ defaultWidth, minWidth, maxWidth, side, persistKey, children, onResize }: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(persistKey);
      return saved ? Math.min(maxWidth, Math.max(minWidth, Number(saved))) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const lastWidthRef = useRef(defaultWidth);

  useEffect(() => {
    try {
      localStorage.setItem(persistKey, String(width));
    } catch {}
  }, [width, persistKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = side === 'left'
        ? Math.min(maxWidth, Math.max(minWidth, startWidth + delta))
        : Math.min(maxWidth, Math.max(minWidth, startWidth - delta));
      setWidth(newWidth);
      onResize?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, minWidth, maxWidth, side, onResize]);

  const handleDoubleClick = useCallback(() => {
    if (isCollapsed) {
      setWidth(lastWidthRef.current);
      setIsCollapsed(false);
    } else {
      lastWidthRef.current = width;
      setWidth(minWidth);
      setIsCollapsed(true);
    }
  }, [isCollapsed, width, minWidth]);

  const divider = (
    <div
      className={`resizable-divider ${side} ${isResizing ? 'active' : ''}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    />
  );

  return (
    <div className={`resizable-panel ${side}`} style={{ width }}>
      {side === 'left' && children}
      {divider}
      {side === 'right' && children}
    </div>
  );
}
