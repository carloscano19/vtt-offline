import React, { useState, useEffect } from 'react';
import { diceManager } from '../../modules/dice/diceManager';
import { DiceRollResult } from '../../types/dice';
import { DiceShape } from './DiceShapes';
import { History, X, Dices, EyeOff } from 'lucide-react';

interface ActiveRollItemProps {
  roll: DiceRollResult;
}

const ActiveRollItem: React.FC<ActiveRollItemProps> = ({ roll }) => {
  const [isRolling, setIsRolling] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRolling(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const hasNat20 = roll.dice.some((d) => !d.dropped && d.isNat20);
  const hasNat1 = roll.dice.some((d) => !d.dropped && d.isNat1);

  return (
    <div className="bg-slate-900/95 border border-slate-700/90 rounded-xl p-3 shadow-2xl backdrop-blur-md pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-4 duration-300 w-80 text-slate-200">
      {/* Cabecera con nombre y fórmula */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold truncate">
          <span className="text-sky-400 truncate">{roll.rollerName}</span>
          <span className="text-slate-500 font-mono text-[11px]">({roll.formula.split('→')[0].split(':')[1]?.trim()})</span>
        </div>
        {roll.isSecret && (
          <span className="flex items-center gap-1 text-[10px] bg-amber-950/80 border border-amber-600/50 text-amber-300 px-1.5 py-0.5 rounded">
            <EyeOff className="w-3 h-3" />
            <span>Oculta</span>
          </span>
        )}
      </div>

      {/* Dados rodando */}
      <div className="flex items-center justify-center gap-3 py-1 flex-wrap">
        {roll.dice.map((die, idx) => (
          <DiceShape key={idx} dieType={die.dieType || roll.dieType || 'd20'} die={die} isRolling={isRolling} />
        ))}
      </div>

      {/* Resultado y fórmula final */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <div className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
          {isRolling ? 'Rodando...' : roll.formula.split('→')[1]?.trim() || ''}
        </div>
        <div className="flex items-center gap-1.5">
          {!isRolling && (
            <span
              className={`font-mono text-xl font-extrabold px-2.5 py-0.5 rounded-lg border shadow-sm ${
                hasNat20
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                  : hasNat1
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                  : 'bg-slate-800 text-white border-slate-700'
              }`}
            >
              {roll.total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const DiceRollOverlay: React.FC = () => {
  const [activeRolls, setActiveRolls] = useState<DiceRollResult[]>(diceManager.getActiveRolls());
  const [history, setHistory] = useState<DiceRollResult[]>(diceManager.getHistory());
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsubActive = diceManager.onActiveRollsChange((rolls) => {
      setActiveRolls(rolls);
    });
    const unsubHist = diceManager.onHistoryChange((hist) => {
      setHistory(hist);
    });
    return () => {
      unsubActive();
      unsubHist();
    };
  }, []);

  return (
    <>
      {/* Contenedor en la esquina inferior derecha para las tiradas animadas */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col-reverse items-end gap-2.5 pointer-events-none select-none max-w-sm">
        {/* Botón flotante discreto de Historial */}
        <button
          onClick={() => setShowHistory(true)}
          className="pointer-events-auto bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg shadow-lg backdrop-blur-xs text-xs flex items-center gap-1.5 transition-all cursor-pointer opacity-70 hover:opacity-100"
          title="Ver historial de tiradas de la sesión"
        >
          <History className="w-3.5 h-3.5 text-sky-400" />
          <span>Historial ({history.length})</span>
        </button>

        {/* Tiradas activas apiladas */}
        {activeRolls.map((roll) => (
          <ActiveRollItem key={roll.id} roll={roll} />
        ))}
      </div>

      {/* Modal / Panel de Historial de Tiradas (últimas 50) */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl text-slate-200 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Dices className="w-4 h-4" />
                <span>Historial de Tiradas ({history.length})</span>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {history.length === 0 ? (
                <div className="text-xs text-slate-500 italic text-center py-8">
                  No hay tiradas registradas todavía en esta sesión.
                </div>
              ) : (
                history.map((h) => {
                  const timeStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div
                      key={h.id}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sky-300">{h.rollerName}</span>
                        <span className="font-mono text-[10px] text-slate-500">{timeStr}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                        <span className="font-mono text-slate-400 text-[11px] truncate max-w-[260px]">
                          {h.formula}
                        </span>
                        <span className="font-mono font-bold text-sm text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 shrink-0">
                          {h.total}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
