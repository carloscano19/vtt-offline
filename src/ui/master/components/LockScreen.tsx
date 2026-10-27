import React, { useState, useEffect } from 'react';
import { authManager } from '../../../modules/auth/authManager';
import { cloudGameSync } from '../../../modules/persistence/cloudGameSync';
import { cloudSync } from '../../../modules/sync/cloudSync';
import { Lock, Eye, EyeOff, KeyRound, WifiOff, AlertCircle } from 'lucide-react';

interface LockScreenProps {
  onUnlock?: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isOnline) {
      setErrorMessage('Necesitas conexión para entrar la primera vez');
      return;
    }

    const trimmed = password.trim();
    if (!trimmed) {
      setErrorMessage('Introduce la clave de la mesa');
      return;
    }

    setLoading(true);
    try {
      const { error } = await authManager.signInWithSharedPassword(trimmed);
      if (error) {
        setErrorMessage('Clave incorrecta');
      } else {
        // Carga la aventura de la nube y sincroniza
        await cloudGameSync.syncOnStartupOrLogin();
        cloudSync.syncOnLogin().catch((err) => console.warn('[LockScreen] Error en syncOnLogin:', err));
        if (onUnlock) onUnlock();
      }
    } catch {
      setErrorMessage('Clave incorrecta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-950 flex items-center justify-center p-4 z-50 select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl text-slate-200 space-y-6 animate-fade-in">
        {/* Cabecera / Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">VTT Offline</h1>
          <p className="text-xs text-slate-400">Tablero Virtual de Rol para Máster y TV</p>
        </div>

        {/* Aviso si no hay conexión */}
        {!isOnline && (
          <div className="p-3 bg-amber-950/70 border border-amber-500/70 rounded-lg text-xs text-amber-200 flex items-start gap-2 animate-fade-in">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>Necesitas conexión para entrar la primera vez</span>
          </div>
        )}

        {/* Mensaje de error */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/70 border border-rose-500/80 rounded-lg text-xs text-rose-200 flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulario de clave */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 block">
              Clave de la mesa
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña de acceso..."
                autoFocus
                disabled={loading}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors"
                title={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-xl text-xs font-semibold text-white shadow-lg shadow-sky-600/20 transition-all flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 active:scale-[0.99] ${
              loading ? 'opacity-60 cursor-wait' : ''
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>{loading ? 'Comprobando clave...' : 'Entrar'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
