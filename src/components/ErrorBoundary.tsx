import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
    this.props.onError?.();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-primary, #1a1a2e)',
          background: 'var(--bg-primary, #ffffff)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '20px' }}>Something went wrong</h2>
          <code style={{
            display: 'block',
            background: 'var(--bg-elevated, #f5f5f5)',
            border: '1px solid var(--border-color, #e0e0e0)',
            borderRadius: '4px',
            padding: '12px 16px',
            maxWidth: '600px',
            overflow: 'auto',
            fontSize: '13px',
            textAlign: 'left',
            marginBottom: '20px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message}
          </code>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px',
                background: 'var(--accent, #4a90d9)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Reload Page
            </button>
            <a
              href="https://github.com/user/sysml-viewer/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 20px',
                background: 'transparent',
                color: 'var(--accent, #4a90d9)',
                border: '1px solid var(--accent, #4a90d9)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Report Issue
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface PanelErrorBoundaryProps {
  children: ReactNode;
  panelName?: string;
}

class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[PanelErrorBoundary]', {
      panel: this.props.panelName || 'unknown',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '16px',
          textAlign: 'center',
          color: 'var(--text-secondary, #666)',
          background: 'var(--bg-primary, #ffffff)',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #1a1a2e)' }}>
            Panel Error
          </p>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '4px 12px',
              background: 'var(--accent, #4a90d9)',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary, PanelErrorBoundary };
