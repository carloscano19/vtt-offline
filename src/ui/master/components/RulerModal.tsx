import React from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { X, Ruler, CircleDot, Slash } from 'lucide-react';
import { RulerMode, DiagonalRule } from '../../../types/game';

interface RulerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulerModal: React.FC<RulerModalProps> = ({ isOpen, onClose }) => {
  const ruler = useUIStore((s) => s.ruler);
  const setRulerMode = useUIStore((s) => s.setRulerMode);
  const setRulerDiagonalRule = useUIStore((s) => s.setRulerDiagonalRule);
  const setRulerVisibleToPlayers = useUIStore((s) => s.setRulerVisibleToPlayers);
  const clearRuler = useUIStore((s) => s.clearRuler);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-96 p-5 text-slate-200 space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-sm text-white">Configuración de Regla</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modo de medición */}
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400 block font-medium">Modo de medición (D&D 5e)</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRulerMode('straight')}
              className={`p-2 rounded border flex items-center justify-center gap-2 text-xs font-medium transition-all ${
                ruler.mode === 'straight'
                  ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              <Slash className="w-4 h-4" />
              <span>Línea</span>
            </button>
            <button
              onClick={() => setRulerMode('radial')}
              className={`p-2 rounded border flex items-center justify-center gap-2 text-xs font-medium transition-all ${
                ruler.mode === 'radial'
                  ? 'bg-sky-950/80 border-sky-500 text-sky-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              <CircleDot className="w-4 h-4" />
              <span>Círculo</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            Regla D&D 5e: 1 casilla = 5 pies. Las diagonales cuentan 1 casilla en cualquier ángulo.
          </p>
        </div>

        {/* Visibilidad para jugadores */}
        <div className="pt-2 border-t border-slate-700/80">
          <label className="flex items-center justify-between text-xs cursor-pointer">
            <div>
              <span className="text-slate-300 block font-medium">Mostrar regla a los jugadores</span>
              <span className="text-[10px] text-slate-500 block">
                Los jugadores verán la línea y distancia que estés midiendo
              </span>
            </div>
            <input
              type="checkbox"
              checked={ruler.visibleToPlayers}
              onChange={(e) => setRulerVisibleToPlayers(e.target.checked)}
              className="w-4 h-4 accent-sky-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={clearRuler}
            className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors border border-slate-700"
          >
            Limpiar medida
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
