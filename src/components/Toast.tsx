import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const toastConfig: Record<ToastType, { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle, color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.12)' },
  error: { icon: XCircle, color: 'var(--error)', bg: 'rgba(239, 68, 68, 0.12)' },
  warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.12)' },
  info: { icon: Info, color: 'var(--text-accent)', bg: 'rgba(99, 102, 241, 0.12)' },
};

let toastListeners: ((toast: ToastItem) => void)[] = [];

export function showToast(message: string, type: ToastType = 'info') {
  const toast: ToastItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    message,
    type,
  };
  toastListeners.forEach((fn) => fn(toast));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (toast: ToastItem) => {
      setToasts((prev) => [...prev, toast]);
    };
    toastListeners.push(handler);

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.message) {
        showToast(detail.message, detail.type || 'info');
      }
    };
    window.addEventListener('sysml-toast', onCustom);

    return () => {
      toastListeners = toastListeners.filter((f) => f !== handler);
      window.removeEventListener('sysml-toast', onCustom);
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const cfg = toastConfig[toast.type];
  const Icon = cfg.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`toast ${exiting ? 'toast-exit' : 'toast-enter'}`}
      style={{ background: cfg.bg, borderColor: cfg.color }}
      role="alert"
    >
      <Icon size={16} style={{ color: cfg.color, flexShrink: 0 }} />
      <span className="toast-message" style={{ color: 'var(--text-primary)' }}>
        {toast.message}
      </span>
      <button
        className="toast-close"
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(toast.id), 300);
        }}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
