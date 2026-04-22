import { useCallback } from 'react';
import type { ParseError } from '../parser/types';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';

interface ErrorPanelProps {
  errors: ParseError[];
  onJumpToLine?: (line: number) => void;
}

const severityConfig = {
  error: { label: 'Error', icon: XCircle, color: 'var(--error)' },
  warning: { label: 'Warning', icon: AlertTriangle, color: 'var(--warning)' },
  info: { label: 'Info', icon: Info, color: 'var(--text-accent)' },
};

export default function ErrorPanel({ errors, onJumpToLine }: ErrorPanelProps) {
  const counts = {
    error: errors.filter((e) => (e.severity || 'error') === 'error').length,
    warning: errors.filter((e) => e.severity === 'warning').length,
    info: errors.filter((e) => e.severity === 'info').length,
  };

  const handleClick = useCallback(
    (line: number) => {
      if (onJumpToLine) onJumpToLine(line);
    },
    [onJumpToLine]
  );

  return (
    <div className="error-panel">
      <div className="error-panel-header">
        <span className="error-panel-title">Diagnostics</span>
        <div className="error-counts">
          {counts.error > 0 && (
            <span className="error-count-badge error">
              <XCircle size={12} />
              {counts.error}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="error-count-badge warning">
              <AlertTriangle size={12} />
              {counts.warning}
            </span>
          )}
          {counts.info > 0 && (
            <span className="error-count-badge info">
              <Info size={12} />
              {counts.info}
            </span>
          )}
          {errors.length === 0 && (
            <span className="error-count-badge ok">
              <AlertCircle size={12} />
              0
            </span>
          )}
        </div>
      </div>

      <div className="error-list">
        {errors.length === 0 && (
          <div className="error-empty">
            <AlertCircle size={20} />
            <span>No issues detected</span>
          </div>
        )}
        {errors.map((err, idx) => {
          const sev = err.severity || 'error';
          const cfg = severityConfig[sev];
          const Icon = cfg.icon;
          const line = err.location?.start.line ?? 1;
          return (
            <button
              key={idx}
              className="error-item"
              onClick={() => handleClick(line)}
              title={err.suggestion ? `Suggestion: ${err.suggestion}` : undefined}
            >
              <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
              <div className="error-item-content">
                <div className="error-item-message">{err.message}</div>
                {err.suggestion && (
                  <div className="error-item-suggestion">Did you mean: {err.suggestion}?</div>
                )}
                <div className="error-item-meta">
                  Line {line}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
