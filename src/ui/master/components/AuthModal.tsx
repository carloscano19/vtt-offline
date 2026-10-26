import React, { useState, useEffect } from 'react';
import { authManager } from '../../../modules/auth/authManager';
import { X, LogIn, Mail, Lock, Sparkles, CheckCircle, AlertCircle, LogOut } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup' | 'magiclink';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState(authManager.getUser());

  useEffect(() => {
    return authManager.onAuthStateChange((user) => {
      setCurrentUser(user);
    });
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Por favor introduce tu dirección de correo electrónico.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'magiclink') {
        const { error } = await authManager.signInWithMagicLink(trimmedEmail);
        if (error) {
          setErrorMessage(error.message);
        } else {
          setSuccessMessage('¡Enlace mágico enviado! Revisa tu bandeja de entrada o spam para acceder.');
        }
      } else if (mode === 'signup') {
        if (!password || password.length < 6) {
          setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }
        const { error, needsEmailConfirmation } = await authManager.signUpWithPassword(trimmedEmail, password);
        if (error) {
          setErrorMessage(error.message);
        } else if (needsEmailConfirmation) {
          setSuccessMessage('¡Cuenta creada! Se ha enviado un enlace de confirmación a tu correo.');
        } else {
          setSuccessMessage('¡Sesión iniciada correctamente!');
          setTimeout(() => onClose(), 1200);
        }
      } else {
        // signin
        if (!password) {
          setErrorMessage('Por favor introduce tu contraseña.');
          setLoading(false);
          return;
        }
        const { error } = await authManager.signInWithPassword(trimmedEmail, password);
        if (error) {
          setErrorMessage(error.message);
        } else {
          setSuccessMessage('¡Bienvenido! Sesión iniciada correctamente.');
          setTimeout(() => onClose(), 1000);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await authManager.signOut();
    setLoading(false);
    setSuccessMessage('Sesión cerrada correctamente.');
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200 space-y-5">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Biblioteca en la Nube</h2>
              <p className="text-[11px] text-slate-400">Guarda y sincroniza tus tokens, objetos y música</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Si ya hay usuario conectado */}
        {currentUser ? (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                {currentUser.email ? currentUser.email[0].toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-400">Sesión iniciada como:</div>
                <div className="text-sm font-semibold text-white truncate">{currentUser.email}</div>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded border border-slate-700/50">
              Tu biblioteca de tokens, objetos y efectos se sincroniza automáticamente con tu cuenta en la nube. Los mapas y partidas se mantienen seguros en tu almacenamiento local.
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
          /* Formulario de autenticación */
          <div className="space-y-4">
            {/* Pestañas de modo */}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded transition-all ${
                  mode === 'signin' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded transition-all ${
                  mode === 'signup' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Registrarse
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('magiclink');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded transition-all flex items-center justify-center gap-1 ${
                  mode === 'magiclink' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3 text-purple-300" />
                <span>Enlace mágico</span>
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

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">Correo electrónico</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="aventurero@ejemplo.com"
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {mode !== 'magiclink' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300 block">Contraseña</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'magiclink' && (
                <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/40 p-2.5 rounded border border-slate-700/50">
                  Te enviaremos un enlace a tu correo. Al pulsar sobre él, iniciarás sesión inmediatamente en esta app sin necesidad de recordar contraseñas.
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold text-white shadow-md transition-all flex items-center justify-center gap-2 ${
                  loading ? 'opacity-60 cursor-wait' : ''
                } ${mode === 'magiclink' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-sky-600 hover:bg-sky-500'}`}
              >
                {loading ? (
                  <span>Procesando...</span>
                ) : mode === 'signup' ? (
                  <span>Crear cuenta y sincronizar</span>
                ) : mode === 'magiclink' ? (
                  <span>Enviar enlace mágico</span>
                ) : (
                  <span>Iniciar sesión</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
