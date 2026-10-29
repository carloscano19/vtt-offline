import React from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let colorClasses = 'bg-slate-900/95 border-slate-700 text-slate-100';
        let iconColor = 'text-sky-400';

        if (toast.type === 'warning') {
          colorClasses = 'bg-slate-900/95 border-amber-500/80 text-amber-200';
          iconColor = 'text-amber-400';
          Icon = AlertCircle;
        } else if (toast.type === 'success') {
          colorClasses = 'bg-slate-900/95 border-emerald-500/80 text-emerald-200';
          iconColor = 'text-emerald-400';
          Icon = CheckCircle;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border shadow-2xl backdrop-blur-md text-xs select-none animate-in fade-in slide-in-from-top-2 duration-150 ${colorClasses}`}
          >
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
              <span className="font-medium leading-snug">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
