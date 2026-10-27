import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, ExternalLink, ShieldCheck, Heart } from 'lucide-react';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Créditos y Licencias</h2>
              <p className="text-xs text-slate-400">VTT Offline · Tablero virtual para máster y jugadores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs leading-relaxed">
          {/* Sección JB2A */}
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-300 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Efectos animados: JB2A
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                CC BY-NC-SA 4.0
              </span>
            </div>
            <p className="text-slate-300">
              Efectos animados creados por <strong>Jules & Ben's Animated Assets (JB2A)</strong>.
              Animaciones en formato WebM transparente para hechizos, fuego, luces, portales y niebla.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3 text-xs">
              <a
                href="https://jb2a.com"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline font-medium"
              >
                <span>Sitio web oficial (jb2a.com)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://github.com/Jules-Bens-Aa/JB2A_DnD5e"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline font-medium"
              >
                <span>Repositorio GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Licenciado bajo Creative Commons Reconocimiento-NoComercial-CompartirIgual 4.0 Internacional (CC BY-NC-SA 4.0).
            </p>
          </div>

          {/* Software y librerías de código abierto */}
          <div className="space-y-2 pt-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Tecnologías de código abierto</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">PixiJS</div>
                <div className="text-[11px] text-slate-400">Motor de renderizado 2D (MIT)</div>
              </div>
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">@zip.js/zip.js</div>
                <div className="text-[11px] text-slate-400">Lector ZIP de streaming (BSD)</div>
              </div>
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">Dexie.js</div>
                <div className="text-[11px] text-slate-400">Almacenamiento IndexedDB (Apache 2.0)</div>
              </div>
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">Lucide React</div>
                <div className="text-[11px] text-slate-400">Iconografía moderna (ISC)</div>
              </div>
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">PolyClip / PolygonClipping</div>
                <div className="text-[11px] text-slate-400">Geometría de niebla y visión (MIT)</div>
              </div>
              <div className="p-2 rounded bg-slate-800/50 border border-slate-700/60">
                <div className="font-semibold text-white">Supabase JS</div>
                <div className="text-[11px] text-slate-400">Sincronización en la nube (Apache 2.0)</div>
              </div>
            </div>
          </div>

          {/* Pie */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-500 text-[11px]">
            <span>Desarrollado para mesas de rol</span>
            <span className="flex items-center gap-1">
              Hecho con <Heart className="w-3 h-3 text-rose-500 fill-rose-500" /> para rol offline
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
