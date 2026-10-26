import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { db } from '../../db/dexie';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    window.location.reload();
  };

  private handleResetFogAndRetry = async () => {
    try {
      // 1. Resetear niebla en el store en memoria
      const store = useGameStore.getState();
      if (store && store.game) {
        store.resetFogExploration();
      }

      // 2. Limpiar niebla en el autoguardado de Dexie / IndexedDB
      const autoSaveRecord = await db.autoSave.get('current');
      if (autoSaveRecord && autoSaveRecord.data && autoSaveRecord.data.fog) {
        autoSaveRecord.data.fog.explored = [];
        autoSaveRecord.data.fog.revealed = [];
        await db.autoSave.put(autoSaveRecord);
      }
    } catch (e) {
      console.error('Error al resetear niebla:', e);
    } finally {
      window.location.reload();
    }
  };

  private handleSaveBackup = () => {
    try {
      const state = useGameStore.getState().game;
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vtt-backup-${state?.name ? state.name.replace(/\s+/g, '_') : 'game'}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error al exportar copia de seguridad:', e);
      alert('No se pudo generar el archivo de respaldo: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Error desconocido';
      const errorStack = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            width: '100vw',
            backgroundColor: 'var(--bg-primary, #090d16)',
            color: 'var(--text-primary, #f8fafc)',
            padding: '24px',
            boxSizing: 'border-box',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          <div
            style={{
              maxWidth: '620px',
              width: '100%',
              backgroundColor: 'var(--bg-panel, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>⚠️</span>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Ha ocurrido un error</h1>
            </div>

            <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted, #94a3b8)', fontSize: '14px', lineHeight: 1.5 }}>
              La aplicación ha detectado un problema inesperado durante el renderizado. Puedes reintentar la carga,
              reiniciar la niebla de exploración (en caso de que los datos geométricos se hayan corrompido) o descargar
              una copia de respaldo de tu partida antes de continuar.
            </p>

            <div
              style={{
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '20px',
                maxHeight: '140px',
                overflowY: 'auto',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#f87171',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {errorMessage}
              {errorStack ? `\n\n${errorStack}` : ''}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={this.handleSaveBackup}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '14px'
                }}
              >
                Guardar copia en archivo
              </button>

              <button
                onClick={this.handleResetFogAndRetry}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#b91c1c',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '14px'
                }}
              >
                Reiniciar niebla y reintentar
              </button>

              <button
                onClick={this.handleRetry}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--accent, #38bdf8)',
                  color: '#090d16',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px'
                }}
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
