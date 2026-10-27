import React, { useState } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { X, Grid } from 'lucide-react';
import { getZoomSensitivity, setZoomSensitivity } from '../../../modules/settings/zoomSensitivity';

interface GridModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GridModal: React.FC<GridModalProps> = ({ isOpen, onClose }) => {
  const grid = useGameStore((s) => s.game.grid);
  const setGridConfig = useGameStore((s) => s.setGridConfig);
  const [zoomSensitivity, setZoomSensState] = useState(() => getZoomSensitivity());

  const handleSensitivityChange = (val: number) => {
    setZoomSensState(val);
    setZoomSensitivity(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-96 p-5 text-slate-200 space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div className="flex items-center gap-2">
            <Grid className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-sm text-white">Configuración de Cuadrícula</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tamaño de casilla */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Tamaño de casilla</span>
            <span className="font-mono text-sky-400 font-medium">{grid.size} px</span>
          </div>
          <input
            type="range"
            min="25"
            max="200"
            value={grid.size}
            onChange={(e) => setGridConfig({ size: parseInt(e.target.value) || 70 })}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <p className="text-[10px] text-slate-500">
            Al cambiar el tamaño, todos los mapas se reescalan automáticamente para mantenerse alineados.
          </p>
        </div>

        {/* Color y Opacidad */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 block">Color de línea</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={grid.color}
                onChange={(e) => setGridConfig({ color: e.target.value })}
                className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
              />
              <span className="text-xs font-mono">{grid.color}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Opacidad</span>
              <span className="font-mono">{Math.round(grid.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={grid.opacity}
              onChange={(e) => setGridConfig({ opacity: parseFloat(e.target.value) })}
              className="w-full accent-sky-500 cursor-pointer mt-2"
            />
          </div>
        </div>

        {/* Interruptor destacado de Ajuste a Cuadrícula (Snap) */}
        <div className={`p-3 rounded-lg border transition-all ${
          grid.snapToGrid 
            ? 'bg-sky-950/40 border-sky-500/50 shadow-sm shadow-sky-950/30' 
            : 'bg-slate-800/40 border-slate-700/60'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Ajustar a la cuadrícula (Snap)</span>
                <span className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded ${
                  grid.snapToGrid 
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' 
                    : 'bg-slate-700/60 text-slate-400 border border-slate-600/40'
                }`}>
                  {grid.snapToGrid ? 'Activo' : 'Desactivado'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                Alinea fichas y puertas al soltar. Mantén <span className="font-semibold text-sky-300 bg-slate-800 px-1 py-0.5 rounded border border-slate-600/60">Alt</span> al soltar para colocar sin ajuste.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={grid.snapToGrid}
              onClick={() => setGridConfig({ snapToGrid: !grid.snapToGrid })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                grid.snapToGrid ? 'bg-sky-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  grid.snapToGrid ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Interruptor Visibilidad de Líneas */}
        <div className="pt-1">
          <label className="flex items-center justify-between text-xs cursor-pointer p-1.5 rounded hover:bg-slate-800/40">
            <span className="text-slate-300">Mostrar líneas de cuadrícula</span>
            <input
              type="checkbox"
              checked={grid.visible}
              onChange={(e) => setGridConfig({ visible: e.target.checked })}
              className="w-4 h-4 accent-sky-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Casilla: Las paredes bloquean el movimiento */}
        <div className="pt-1">
          <label className="flex items-center justify-between text-xs cursor-pointer p-1.5 rounded hover:bg-slate-800/40">
            <div>
              <span className="text-slate-300 font-medium block">Las paredes bloquean el movimiento</span>
              <span className="text-[10px] text-slate-500 block">Impide atravesar muros con flechas o al arrastrar (desactivado por defecto)</span>
            </div>
            <input
              type="checkbox"
              checked={grid.wallsBlockMovement ?? false}
              onChange={(e) => setGridConfig({ wallsBlockMovement: e.target.checked })}
              className="w-4 h-4 accent-sky-500 cursor-pointer ml-3 shrink-0"
            />
          </label>
        </div>

        {/* Sensibilidad del zoom */}
        <div className="space-y-1.5 pt-2 border-t border-slate-700/80">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">Sensibilidad del zoom</span>
            <span className="font-mono text-sky-400 font-medium">{zoomSensitivity.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={zoomSensitivity}
            onChange={(e) => handleSensitivityChange(parseFloat(e.target.value) || 1)}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0.25× (Suave)</span>
            <span>1.00× (Por defecto)</span>
            <span>2.00× (Rápido)</span>
          </div>
        </div>

        {/* Botón cerrar */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium text-xs transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
