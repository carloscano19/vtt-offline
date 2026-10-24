import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CanvasErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CanvasErrorBoundary] Error en PixiCanvas:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-slate-200 text-center select-none">
          <div className="bg-slate-900 border border-red-500/50 rounded-xl p-8 max-w-md shadow-2xl space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">
              {this.props.fallbackTitle || 'Error en el renderizador del tablero'}
            </h2>
            <p className="text-xs text-slate-400">
              Ocurrió una excepción con PixiJS o el contexto WebGL. El resto de la interfaz sigue disponible.
            </p>
            {this.state.error && (
              <pre className="p-3 bg-slate-950/80 rounded border border-slate-800 text-[11px] text-red-300 overflow-x-auto text-left font-mono">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 mx-auto transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reiniciar tablero</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
