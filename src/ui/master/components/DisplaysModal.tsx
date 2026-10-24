import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { X, Monitor, Maximize2, Tv, ExternalLink } from 'lucide-react';

interface WebScreenDetails {
  screens: any[];
  currentScreen?: any;
}

export const DisplaysModal: React.FC = () => {
  const showDisplaysModal = useUIStore((s) => s.showDisplaysModal);
  const setShowDisplaysModal = useUIStore((s) => s.setShowDisplaysModal);

  const [screens, setScreens] = useState<any[]>([]);
  const [hasWindowManagement, setHasWindowManagement] = useState(false);
  const [screenDetails, setScreenDetails] = useState<WebScreenDetails | null>(null);

  // Comprobar soporte de Window Management API (window.getScreenDetails)
  useEffect(() => {
    if (showDisplaysModal) {
      if ('getScreenDetails' in window) {
        setHasWindowManagement(true);
        (window as any)
          .getScreenDetails()
          .then((details: WebScreenDetails) => {
            setScreenDetails(details);
            setScreens(details.screens || []);
          })
          .catch((err: any) => {
            console.log('Permiso de pantallas no concedido o rechazado:', err);
            setScreens([]);
          });
      } else {
        setHasWindowManagement(false);
      }
    }
  }, [showDisplaysModal]);

  if (!showDisplaysModal) return null;

  // Abrir ventana de jugadores
  const handleOpenPlayersWindow = (targetScreen?: any) => {
    let windowFeatures = 'menubar=no,toolbar=no,location=no,status=no,resizable=yes';

    if (targetScreen) {
      // Posicionar en la pantalla elegida
      const left = targetScreen.availLeft ?? targetScreen.left ?? 0;
      const top = targetScreen.availTop ?? targetScreen.top ?? 0;
      const width = targetScreen.availWidth ?? targetScreen.width ?? 1280;
      const height = targetScreen.availHeight ?? targetScreen.height ?? 720;
      windowFeatures += `,left=${left},top=${top},width=${width},height=${height}`;
    } else {
      windowFeatures += ',width=1280,height=720';
    }

    const playersUrl = `${window.location.origin}${window.location.pathname}?window=players`;
    window.open(playersUrl, 'vtt_offline_players_window', windowFeatures);
    setShowDisplaysModal(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[480px] p-5 text-slate-200 space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">Pantalla de Jugadores</h3>
          </div>
          <button onClick={() => setShowDisplaysModal(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Abre la vista limpia del tablero para proyectar en una segunda pantalla, televisión o monitor secundario.
        </p>

        {/* Si soporta Window Management API y hay pantallas detectadas */}
        {hasWindowManagement && screens.length > 1 ? (
          <div className="space-y-2">
            <span className="text-[11px] text-slate-400 font-medium block">
              Pantallas detectadas en tu equipo:
            </span>
            {screens.map((s, idx) => {
              const isCurrent = screenDetails?.currentScreen === s;
              const label = s.label || `Pantalla ${idx + 1}`;
              const isSecondary = !s.isPrimary;

              return (
                <div
                  key={idx}
                  className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-sky-400" />
                      <span className="font-semibold text-xs text-white truncate">{label}</span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.2 text-[9px] bg-slate-700 text-slate-300 rounded font-semibold uppercase">
                          Actual (Máster)
                        </span>
                      )}
                      {isSecondary && (
                        <span className="px-1.5 py-0.2 text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-semibold uppercase">
                          TV / Secundaria
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Resolución: {s.width} x {s.height}
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenPlayersWindow(s)}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Abrir aquí</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          /* Modo estándar web o cuando no hay Window Management / una sola pantalla */
          <div className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-lg space-y-3 text-center">
            <Tv className="w-8 h-8 text-sky-400 mx-auto" />
            <p className="text-xs text-slate-300">
              Pulsa el botón para abrir la ventana de jugadores en una nueva pestaña o ventana del navegador.
            </p>
            <div className="p-2.5 bg-sky-950/40 border border-sky-800/60 rounded text-[11px] text-sky-300 text-left">
              💡 <strong>Instrucción para dos pantallas:</strong> Arrastra la ventana de jugadores a tu TV o monitor secundario y pulsa el botón de pantalla completa o la tecla <kbd className="px-1 bg-slate-800 border border-slate-700 rounded text-white font-mono">F11</kbd>.
            </div>
            <button
              onClick={() => handleOpenPlayersWindow()}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Abrir pantalla de jugadores</span>
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-[11px] text-slate-500">
          <span>La ventana de jugadores se sincroniza 100% offline.</span>
          <button
            onClick={() => handleOpenPlayersWindow()}
            className="text-sky-400 hover:underline"
          >
            Abrir ventana normal
          </button>
        </div>
      </div>
    </div>
  );
};
