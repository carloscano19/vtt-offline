import React, { useState, useEffect } from 'react';
import { diceManager } from '../../modules/dice/diceManager';
import { DiceRollResult } from '../../types/dice';
import { dice3dManager } from '../../modules/dice/dice3dManager';
import { DiceShape } from './DiceShapes';
import { History, X, Dices, EyeOff } from 'lucide-react';

interface ActiveRollItemProps {
  roll: DiceRollResult;
}

const ActiveRollItem: React.FC<ActiveRollItemProps> = ({ roll }) => {
  const [hasStopped, setHasStopped] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    dice3dManager.roll(roll).then(() => {
      if (mounted) setHasStopped(true);
    }).catch(() => {
      if (mounted) setHasStopped(true);
    });

    return () => {
      mounted = false;
    };
  }, [roll]);

  // La tarjeta debe quedarse visible 6 s desde que aparece (no desde que se tiró) y luego fundirse
  useEffect(() => {
    if (!hasStopped) return;

    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 6000);

    const dismissTimer = setTimeout(() => {
      diceManager.dismissRoll(roll.id);
    }, 6600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [hasStopped, roll.id]);

  if (!hasStopped) return null;

  const hasNat20 = roll.dice.some((d) => !d.dropped && d.isNat20);
  const hasNat1 = roll.dice.some((d) => !d.dropped && d.isNat1);

  // Parsear fórmula para separar pool de dados y desglose aritmético
  const arrowParts = roll.formula.split('→');
  const leftSide = arrowParts[0] || '';
  const rightSide = arrowParts[1] || '';

  const colonIndex = leftSide.indexOf(':');
  const poolFormula = colonIndex !== -1 ? leftSide.slice(colonIndex + 1).trim() : leftSide.trim();

  const detailParts = rightSide.split('=');
  const detailArithmetic = detailParts[0]?.trim() || rightSide.trim();

  return (
    <div
      className={`bg-slate-900/95 border border-slate-700/90 rounded-xl p-3.5 shadow-2xl backdrop-blur-md pointer-events-auto transition-all duration-600 w-84 sm:w-96 max-w-[90vw] text-slate-200 ${
        isFadingOut
          ? 'opacity-0 translate-y-2'
          : 'opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-3 duration-300'
      }`}
    >
      {/* Cabecera con nombre, fórmula y botón de cerrar */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-2 mb-2 text-xs gap-2">
        <div className="flex items-baseline gap-1.5 font-bold flex-wrap min-w-0">
          <span className="text-sky-400">{roll.rollerName}</span>
          <span className="text-slate-400 font-mono text-[11px] break-words whitespace-normal">
            ({poolFormula})
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {roll.isSecret && (
            <span className="flex items-center gap-1 text-[10px] bg-amber-950/80 border border-amber-600/50 text-amber-300 px-1.5 py-0.5 rounded">
              <EyeOff className="w-3 h-3" />
              <span>Oculta</span>
            </span>
          )}
          <button
            onClick={() => diceManager.dismissRoll(roll.id)}
            className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Desglose gráfico de cada dado */}
      <div className="flex items-center justify-center gap-2.5 py-1.5 flex-wrap">
        {roll.dice.map((die, idx) => (
          <DiceShape key={idx} dieType={die.dieType || roll.dieType || 'd20'} die={die} isRolling={false} />
        ))}
      </div>

      {/* Total destacado y desglose detallado en varias líneas sin cortes ni puntos suspensivos */}
      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-start justify-between gap-3">
        <div className="text-xs text-slate-400 font-mono break-words whitespace-normal leading-relaxed flex-1 min-w-0">
          <span className="text-slate-300 font-medium">{detailArithmetic}</span>
          <span className="text-slate-500 font-semibold ml-1.5">=</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-mono text-2xl font-black px-3 py-1 rounded-xl border shadow-md ${
              hasNat20
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.5)]'
                : hasNat1
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-[0_0_14px_rgba(244,63,94,0.5)]'
                : 'bg-slate-800 text-white border-slate-700/80'
            }`}
          >
            {roll.total}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DiceRollOverlay: React.FC = () => {
  const [activeRolls, setActiveRolls] = useState<DiceRollResult[]>(diceManager.getActiveRolls());
  const [history, setHistory] = useState<DiceRollResult[]>(diceManager.getHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [isShortScreen, setIsShortScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight < 680 : false
  );

  useEffect(() => {
    const unsubActive = diceManager.onActiveRollsChange((rolls) => {
      setActiveRolls(rolls);
    });
    const unsubHist = diceManager.onHistoryChange((hist) => {
      setHistory(hist);
    });
    const handleResize = () => {
      setIsShortScreen(window.innerHeight < 680);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      unsubActive();
      unsubHist();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      {/* Contenedor transparente para la simulación física de dados 3D */}
      <div
        id="dice-3d-box"
        className="fixed bottom-0 right-0 w-[480px] h-[360px] max-w-full pointer-events-none z-30 overflow-hidden"
      />

      {/* Contenedor para las tarjetas de resultados: encima de la zona donde caen los dados (o a su izquierda en pantallas de poca altura) */}
      <div
        className={`fixed z-40 flex flex-col-reverse items-end gap-2.5 pointer-events-none select-none max-w-sm sm:max-w-md transition-all duration-300 ${
          isShortScreen ? 'bottom-4 right-[500px]' : 'bottom-[375px] right-4'
        }`}
      >
        {activeRolls.map((roll) => (
          <ActiveRollItem key={roll.id} roll={roll} />
        ))}
      </div>

      {/* Botón flotante discreto de Historial en la esquina inferior derecha */}
      <div className="fixed bottom-3 right-3 z-40 pointer-events-none select-none">
        <button
          onClick={() => setShowHistory(true)}
          className="pointer-events-auto bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg shadow-lg backdrop-blur-xs text-xs flex items-center gap-1.5 transition-all cursor-pointer opacity-70 hover:opacity-100"
          title="Ver historial de tiradas de la sesión"
        >
          <History className="w-3.5 h-3.5 text-sky-400" />
          <span>Historial ({history.length})</span>
        </button>
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
                      <div className="flex items-start justify-between pt-1 border-t border-slate-900 gap-2">
                        <span className="font-mono text-slate-400 text-[11px] break-words whitespace-normal flex-1">
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
