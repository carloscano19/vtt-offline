import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Sparkles, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { DEFAULT_STATUS_TYPES } from '../../../types/entity';

export const TokenStatusesModal: React.FC = () => {
  const editingTokenId = useUIStore((s) => s.editingTokenStatusesId);
  const setEditingTokenId = useUIStore((s) => s.setEditingTokenStatusesId);
  const addToast = useUIStore((s) => s.addToast);

  const token = useGameStore((s) =>
    editingTokenId ? s.game.entities.find((e) => e.id === editingTokenId && e.type === 'token') : undefined
  );
  const addTokenStatus = useGameStore((s) => s.addTokenStatus);
  const removeTokenStatus = useGameStore((s) => s.removeTokenStatus);
  const updateTokenStatus = useGameStore((s) => s.updateTokenStatus);

  // Estado del formulario de nuevo estado
  const [selectedType, setSelectedType] = useState<string>(DEFAULT_STATUS_TYPES[0]);
  const [customType, setCustomType] = useState<string>('');
  const [isInfinite, setIsInfinite] = useState<boolean>(false);
  const [turns, setTurns] = useState<number>(1);
  const [visibleToPlayers, setVisibleToPlayers] = useState<boolean>(true);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingTokenId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setEditingTokenId]);

  if (!editingTokenId || !token) return null;

  const currentStatuses = Array.isArray(token.statuses) ? token.statuses : [];

  const handleAddStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const finalType = selectedType === 'custom' ? customType.trim() : selectedType;
    if (!finalType) {
      addToast('Introduce un nombre para el estado', 'warning', 2500);
      return;
    }

    addTokenStatus(token.id, {
      type: finalType,
      turnsRemaining: isInfinite ? null : Math.max(1, turns),
      visibleToPlayers
    });

    addToast(`Estado "${finalType}" añadido a ${token.name}`, 'info', 2000);
    if (selectedType === 'custom') {
      setCustomType('');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
      onClick={() => setEditingTokenId(null)}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl text-slate-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>Estados de {token.name}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditingTokenId(null)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de estados activos */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Estados activos ({currentStatuses.length})
          </div>

          {currentStatuses.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
              No hay estados o condiciones activas en este token.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {currentStatuses.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-800/70 border border-slate-700/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{st.type}</span>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-700">
                      {st.turnsRemaining !== null ? `${st.turnsRemaining} t.` : '∞'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botón cambiar visibilidad a jugadores */}
                    <button
                      type="button"
                      onClick={() =>
                        updateTokenStatus(token.id, st.id, {
                          visibleToPlayers: st.visibleToPlayers === false
                        })
                      }
                      className={`p-1 rounded text-xs transition-colors ${
                        st.visibleToPlayers !== false
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-slate-500 hover:text-slate-400'
                      }`}
                      title={
                        st.visibleToPlayers !== false
                          ? 'Visible para los jugadores (clic para ocultar)'
                          : 'Oculto para los jugadores (clic para hacer visible)'
                      }
                    >
                      {st.visibleToPlayers !== false ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>

                    {/* Botón eliminar estado */}
                    <button
                      type="button"
                      onClick={() => removeTokenStatus(token.id, st.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      title="Eliminar estado"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulario para añadir nuevo estado */}
        <form onSubmit={handleAddStatus} className="border-t border-slate-800 pt-4 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Añadir condición o estado
          </div>

          <div className="space-y-2">
            {/* Selector de condición D&D o personalizado */}
            <div className="space-y-1">
              <label className="text-xs text-slate-300">Tipo de estado</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {DEFAULT_STATUS_TYPES.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond}
                  </option>
                ))}
                <option value="custom">Otro (Personalizado)...</option>
              </select>
            </div>

            {/* Input texto libre si es personalizado */}
            {selectedType === 'custom' && (
              <div className="space-y-1 animate-in fade-in duration-100">
                <label className="text-xs text-slate-300">Nombre del estado personalizado</label>
                <input
                  type="text"
                  placeholder="Ej: Bendición, Escudo, Concentración..."
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
            )}

            {/* Contador de turnos y opción sin límite */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Turnos de duración</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={turns}
                  disabled={isInfinite}
                  onChange={(e) => setTurns(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 ${
                    isInfinite ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div className="flex flex-col justify-end pb-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInfinite}
                    onChange={(e) => setIsInfinite(e.target.checked)}
                    className="accent-amber-500 rounded cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <InfinityIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sin límite (∞)</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Checkbox visible para jugadores */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleToPlayers}
                  onChange={(e) => setVisibleToPlayers(e.target.checked)}
                  className="accent-emerald-500 rounded cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Visible para jugadores</span>
                </span>
              </label>
            </div>
          </div>

          {/* Botones de acción del formulario */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingTokenId(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cerrar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 shadow transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
