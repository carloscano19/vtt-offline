import React, { useState } from 'react';
import { DieType, DiceRollRequest, DiePoolItem } from '../../types/dice';
import { diceManager } from '../../modules/dice/diceManager';
import { useGameStore } from '../../stores/useGameStore';
import { Dices, Volume2, VolumeX, EyeOff, RotateCcw, AlertCircle, X, Trash2 } from 'lucide-react';

interface DicePanelProps {
  isOpen: boolean;
  onClose: () => void;
  isMaster?: boolean;
  playerName?: string;
}

const DICE_LIST: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export const DicePanel: React.FC<DicePanelProps> = ({
  isOpen,
  onClose,
  isMaster = false,
  playerName = 'Máster'
}) => {
  // Modo combinar (por defecto desactivado: un clic en un dado tira al instante)
  const [isCombineMode, setIsCombineMode] = useState(false);

  // Contadores por cada tipo de dado (para el modo combinar)
  const [pool, setPool] = useState<Record<DieType, number>>({
    d4: 0,
    d6: 0,
    d8: 0,
    d10: 0,
    d12: 0,
    d20: 0,
    d100: 0
  });

  const [modifier, setModifier] = useState<number>(0);
  const [advantage, setAdvantage] = useState<'none' | 'advantage' | 'disadvantage'>('none');
  const [isSecret, setIsSecret] = useState(false);

  const [lastRequest, setLastRequest] = useState<Omit<DiceRollRequest, 'requestId'> | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [waitingWarning, setWaitingWarning] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(diceManager.isMuted());
  const isFrozen = useGameStore((s) => s.game.remotePlayersFrozen);

  if (!isOpen) return null;

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    diceManager.setMuted(next);
  };

  const handleDieClick = (die: DieType) => {
    setPool((prev) => ({
      ...prev,
      [die]: Math.min(20, (prev[die] || 0) + 1)
    }));
  };

  const updateDieCount = (die: DieType, delta: number) => {
    setPool((prev) => ({
      ...prev,
      [die]: Math.max(0, Math.min(20, (prev[die] || 0) + delta))
    }));
  };

  // Limpiar solo los dados seleccionados del pool; modificador y ventaja se conservan siempre
  const handleClear = () => {
    setPool({
      d4: 0,
      d6: 0,
      d8: 0,
      d10: 0,
      d12: 0,
      d20: 0,
      d100: 0
    });
  };

  // Extraer dados activos para la tirada en modo combinar
  const activeDice: DiePoolItem[] = DICE_LIST
    .filter((d) => (pool[d] || 0) > 0)
    .map((d) => ({ dieType: d, count: pool[d] }));

  const totalDice = activeDice.reduce((acc, d) => acc + d.count, 0);
  const isSingleD20 = activeDice.length === 1 && activeDice[0].dieType === 'd20' && activeDice[0].count === 1;

  // Modificador en texto
  const modStr = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` - ${Math.abs(modifier)}` : '';

  // En modo combinar, ventaja/desventaja solo aplica a 1d20
  const advStrCombine = isSingleD20 && advantage === 'advantage'
    ? ' (Ventaja)'
    : isSingleD20 && advantage === 'disadvantage'
    ? ' (Desventaja)'
    : '';

  // Texto o fórmula en la barra superior
  const formulaPreview = isCombineMode
    ? activeDice.length > 0
      ? `${activeDice.map((d) => `${d.count}${d.dieType}`).join(' + ')}${modStr}${advStrCombine}`
      : 'Selecciona dados para combinar'
    : `Tirada rápida (haz clic en un dado)${modStr !== '' ? ` [${modStr.trim()}]` : ''}${
        advantage === 'advantage' ? ' · Ventaja en d20' : advantage === 'disadvantage' ? ' · Desventaja en d20' : ''
      }`;

  const handleRoll = async (overrideReq?: Omit<DiceRollRequest, 'requestId'>) => {
    if (!overrideReq && totalDice === 0) return;

    setWaitingWarning(null);
    setIsRolling(true);

    const req: Omit<DiceRollRequest, 'requestId'> = overrideReq || {
      rollerName: playerName,
      dieType: activeDice[0]?.dieType || 'd20',
      count: activeDice[0]?.count || 1,
      dicePool: activeDice,
      modifier,
      advantage: isSingleD20 ? advantage : 'none',
      isSecret: isMaster ? isSecret : false
    };

    setLastRequest(req);

    // Al tirar en modo combinar, la combinación se limpia sola
    if (!overrideReq && isCombineMode) {
      handleClear();
    }

    try {
      if (isMaster) {
        diceManager.executeMasterRoll(req);
        setIsRolling(false);
      } else {
        await diceManager.requestRollAsPlayer(req);
        setIsRolling(false);
      }
    } catch (err: any) {
      setIsRolling(false);
      setWaitingWarning(err.message || 'Esperando al máster...');
    }
  };

  // Tirada rápida de 1 dado al instante (modo por defecto)
  const handleQuickRoll = (die: DieType) => {
    if (isRolling || (!isMaster && isFrozen)) return;
    const isD20 = die === 'd20';
    const req: Omit<DiceRollRequest, 'requestId'> = {
      rollerName: playerName,
      dieType: die,
      count: 1,
      dicePool: [{ dieType: die, count: 1 }],
      modifier,
      advantage: isD20 ? advantage : 'none',
      isSecret: isMaster ? isSecret : false
    };
    handleRoll(req);
  };

  const handleRepeatLast = () => {
    if (lastRequest) {
      handleRoll(lastRequest);
    } else if (!isCombineMode) {
      handleQuickRoll('d20');
    } else {
      handleRoll();
    }
  };

  // Ventaja/Desventaja: visible en modo rápido (para d20) o en modo combinar si es exactamente 1d20
  const showAdvantageSelector = !isCombineMode || isSingleD20;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/90 rounded-xl p-5 max-w-sm w-full shadow-2xl text-slate-200 space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <Dices className="w-4 h-4" />
            <span>Tirar Dados</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className={`p-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                isMuted ? 'text-slate-500' : 'text-slate-300'
              }`}
              title={isMuted ? 'Activar sonido de dados' : 'Silenciar sonido de dados'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Aviso de espera al máster */}
        {waitingWarning && (
          <div className="bg-amber-950/80 border border-amber-600/60 rounded-lg p-2.5 text-xs text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{waitingWarning}</span>
          </div>
        )}

        {/* Barra superior con fórmula en tiempo real y botón Limpiar */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2 shadow-inner">
          <div className="font-mono text-xs font-bold text-sky-300 truncate" title={formulaPreview}>
            {formulaPreview}
          </div>
          {isCombineMode && (
            <button
              type="button"
              onClick={handleClear}
              disabled={totalDice === 0}
              className="text-[11px] font-medium text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-400 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="Limpiar todos los dados seleccionados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Selector de dados con interruptor Combinar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 block">
              {isCombineMode ? 'Dados en la tirada:' : 'Tirada rápida (1 clic):'}
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <span className={`text-xs font-semibold transition-colors ${isCombineMode ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'}`}>
                Combinar
              </span>
              <div className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={isCombineMode}
                  onChange={(e) => setIsCombineMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500"></div>
              </div>
            </label>
          </div>

          {!isCombineMode ? (
            /* Modo Rápido (por defecto): Un clic tira ese dado al momento */
            <div className="grid grid-cols-4 gap-1.5">
              {DICE_LIST.map((die) => {
                const isD20 = die === 'd20';
                return (
                  <button
                    key={die}
                    type="button"
                    disabled={isRolling || (!isMaster && isFrozen)}
                    onClick={() => handleQuickRoll(die)}
                    className={`h-11 flex items-center justify-center rounded-lg border text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40 shadow-sm ${
                      isD20
                        ? 'bg-sky-950/60 border-sky-500/70 text-sky-200 hover:bg-sky-600 hover:text-white hover:border-sky-400'
                        : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-400'
                    }`}
                    title={`Tirar 1${die}${modStr}${isD20 && advantage !== 'none' ? ` (${advantage === 'advantage' ? 'Ventaja' : 'Desventaja'})` : ''}`}
                  >
                    <span className="text-sm">{die}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Modo Combinar: Pulsar dados los añade a la tirada con contadores - / + */
            <div className="grid grid-cols-4 gap-1.5">
              {DICE_LIST.map((die) => {
                const count = pool[die] || 0;
                const hasCount = count > 0;
                return (
                  <div
                    key={die}
                    className={`rounded-lg border p-1 flex flex-col items-center gap-1 transition-all ${
                      hasCount
                        ? 'bg-sky-950/50 border-sky-500/70 shadow-sm'
                        : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleDieClick(die)}
                      className="w-full text-center py-1 text-xs font-mono font-bold text-slate-200 hover:text-white cursor-pointer active:scale-95"
                      title={`Pulsar para añadir 1${die}`}
                    >
                      {die}
                    </button>
                    <div className="flex items-center justify-between w-full bg-slate-950/80 rounded border border-slate-800 px-0.5 py-0.5 text-[11px]">
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateDieCount(die, -1);
                        }}
                        className="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer font-bold leading-none"
                      >
                        -
                      </button>
                      <span className="font-mono font-semibold text-slate-100 text-[11px] leading-none">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateDieCount(die, 1);
                        }}
                        className="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer font-bold leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modificador (se conserva entre tiradas) */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300 block">Modificador:</label>
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setModifier((m) => m - 1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
            >
              -
            </button>
            <span className="flex-1 text-center font-mono text-sm font-semibold">
              {modifier > 0 ? `+${modifier}` : modifier}
            </span>
            <button
              type="button"
              onClick={() => setModifier((m) => m + 1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Ventaja / Desventaja (para tiradas de 1d20 o cuando hay exactamente 1d20) */}
        {showAdvantageSelector && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-slate-300">Modo d20:</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setAdvantage('none')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  advantage === 'none'
                    ? 'bg-slate-700 border-slate-500 text-white'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setAdvantage('advantage')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  advantage === 'advantage'
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Ventaja
              </button>
              <button
                type="button"
                onClick={() => setAdvantage('disadvantage')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  advantage === 'disadvantage'
                    ? 'bg-rose-600 border-rose-400 text-white'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Desventaja
              </button>
            </div>
          </div>
        )}

        {/* Casilla Tirada Oculta (solo para el máster) */}
        {isMaster && (
          <div className="pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(e) => setIsSecret(e.target.checked)}
                className="accent-amber-500 rounded cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Tirada oculta (solo visible para el máster)</span>
              </span>
            </label>
          </div>
        )}

        {/* Aviso de congelación si la partida está en pausa */}
        {!isMaster && isFrozen && (
          <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Partida en pausa por el máster. No puedes tirar dados hasta que se reanude.</span>
          </div>
        )}

        {/* Botones de acción */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={isRolling || (!isMaster && isFrozen) || (isCombineMode && totalDice === 0)}
            onClick={() => (isCombineMode ? handleRoll() : handleQuickRoll('d20'))}
            className="flex-1 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-sm shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Dices className="w-4 h-4" />
            <span>{isRolling ? 'Tirando...' : isCombineMode ? 'Tirar' : 'Tirar 1d20'}</span>
          </button>

          <button
            type="button"
            disabled={isRolling || (!isMaster && isFrozen) || (!lastRequest && isCombineMode && totalDice === 0)}
            onClick={handleRepeatLast}
            className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 text-xs font-semibold shadow transition-colors cursor-pointer flex items-center gap-1.5"
            title="Repetir la última tirada"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Repetir</span>
          </button>
        </div>
      </div>
    </div>
  );
};


