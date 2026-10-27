import React, { useState, useEffect } from 'react';
import { authManager } from '../../../modules/auth/authManager';
import { cloudSync, formatStorageBytes } from '../../../modules/sync/cloudSync';
import { X, Lock, KeyRound, Eye, EyeOff, LogOut, CheckCircle, AlertCircle, Cloud, HardDrive } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState(authManager.getUser());
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; totalBytes: number; percentage: number }>({
    usedBytes: 0,
    totalBytes: 1024 * 1024 * 1024,
    percentage: 0
  });

  useEffect(() => {
    return authManager.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        cloudSync.getStorageUsage().then(setStorageUsage);
      }
    });
  }, []);

  useEffect(() => {
    if (isOpen && currentUser) {
      cloudSync.getStorageUsage().then(setStorageUsage);
    }
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setPassword('');
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!password) {
      setErrorMessage('Por favor introduce la clave de la mesa.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await authManager.signInWithSharedPassword(password);
      if (error) {
        setErrorMessage(
          error.message.includes('Invalid login credentials')
            ? 'Clave incorrecta. Verifica la contraseña de la mesa.'
            : error.message
        );
      } else {
        setSuccessMessage('¡Clave correcta! Conectado a la nube.');
        const usage = await cloudSync.getStorageUsage();
        setStorageUsage(usage);
        setTimeout(() => onClose(), 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await authManager.signOut();
    setLoading(false);
    setSuccessMessage('Sesión cerrada.');
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200 space-y-5">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {currentUser ? 'Mesa Conectada a la Nube' : 'Clave de la Mesa'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser
                  ? 'Partida y biblioteca compartidas sincronizadas'
                  : 'Introduce la clave para acceder a la nube'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes de error / éxito */}
        {errorMessage && (
          <div className="p-2.5 bg-rose-950/70 border border-rose-500/80 rounded text-xs text-rose-200 flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-2.5 bg-emerald-950/70 border border-emerald-500/80 rounded text-xs text-emerald-200 flex items-start gap-2 animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Si ya hay usuario conectado */}
        {currentUser ? (
          <div className="space-y-4 py-1">
            <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  Estado de sincronización
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-600/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Activo
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Tu partida y todos los elementos de la biblioteca se sincronizan automáticamente con la nube.
              </p>
            </div>

            {/* Almacenamiento consumido */}
            <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  Almacenamiento en la nube
                </span>
                <span className="font-semibold text-slate-200">
                  {formatStorageBytes(storageUsage.usedBytes)} / {formatStorageBytes(storageUsage.totalBytes)} ({storageUsage.percentage}%)
                </span>
              </div>
              <div className="w-full bg-slate-700/60 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, Math.min(100, storageUsage.percentage))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Límite gratuito de Supabase: 1 GB de Storage.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className="px-3 py-2 rounded text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/60 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        ) : (
          /* Formulario limpio: clave de la mesa */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">
                Clave de acceso
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Introduce la contraseña de la mesa..."
                  autoFocus
                  required
                  className="w-full pl-9 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  title={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-2.5 rounded border border-slate-700/50">
              Con esta única clave accederás a la partida guardada y a toda tu biblioteca de mapas, tokens, efectos y música compartida en la nube.
            </p>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg text-xs font-semibold text-white shadow-md transition-all flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 ${
                loading ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Verificando clave...' : 'Entrar a la mesa'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
