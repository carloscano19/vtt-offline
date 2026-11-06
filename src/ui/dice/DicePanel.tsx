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
  // Selector de modo: 'single' (Un dado) o 'multiple' (Varios)
  const [mode, setMode] = useState<'single' | 'multiple'>('single');

  // Estado para el modo Varios: casillas marcadas y contadores (por defecto cantidad 1)
  const [selectedDice, setSelectedDice] = useState<Record<DieType, boolean>>({
    d4: false,
    d6: false,
    d8: false,
    d10: false,
    d12: false,
    d20: false,
    d100: false
  });

  const [counts, setCounts] = useState<Record<DieType, number>>({
    d4: 1,
    d6: 1,
    d8: 1,
    d10: 1,
    d12: 1,
    d20: 1,
    d100: 1
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

  const getDieLabel = (die: DieType) => (die === 'd100' ? 'd100 (%)' : die);

  const toggleSelectDie = (die: DieType) => {
    setSelectedDice((prev) => ({
      ...prev,
      [die]: !prev[die]
    }));
  };

  const updateDieCount = (die: DieType, delta: number) => {
    setCounts((prev) => {
      const cur = prev[die] ?? 1;
      const next = Math.max(1, Math.min(20, cur + delta));
      return { ...prev, [die]: next };
    });
    // Si incrementamos un dado que no estaba marcado, lo marcamos para mayor comodidad
    if (delta > 0) {
      setSelectedDice((prev) => ({ ...prev, [die]: true }));
    }
  };

  // Limpiar selecciones en modo Varios (modificador y ventaja se conservan siempre)
  const handleClear = () => {
    setSelectedDice({
      d4: false,
      d6: false,
      d8: false,
      d10: false,
      d12: false,
      d20: false,
      d100: false
    });
    setCounts({
      d4: 1,
      d6: 1,
      d8: 1,
      d10: 1,
      d12: 1,
      d20: 1,
      d100: 1
    });
  };

  // Extraer dados activos para la tirada en modo Varios
  const activeDice: DiePoolItem[] = DICE_LIST
    .filter((d) => selectedDice[d] && (counts[d] || 0) > 0)
    .map((d) => ({ dieType: d, count: counts[d] || 1 }));

  const totalDice = activeDice.reduce((acc, d) => acc + d.count, 0);
  const isSingleD20 = activeDice.length === 1 && activeDice[0].dieType === 'd20' && activeDice[0].count === 1;

  // Modificador en texto
  const modStr = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` - ${Math.abs(modifier)}` : '';

  // En modo varios, ventaja/desventaja solo aplica si es exactamente 1d20
  const advStrMultiple = isSingleD20 && advantage === 'advantage'
    ? ' (Ventaja)'
    : isSingleD20 && advantage === 'disadvantage'
    ? ' (Desventaja)'
    : '';

  // Texto o fórmula en la barra superior
  const formulaPreview = mode === 'multiple'
    ? activeDice.length > 0
      ? `${activeDice.map((d) => `${d.count}${d.dieType === 'd100' ? 'd100 (%)' : d.dieType}`).join(' + ')}${modStr}${advStrMultiple}`
      : 'Marca los dados que quieras tirar'
    : `Tirada rápida (haz clic en un dado)${modStr !== '' ? ` [${modStr.trim()}]` : ''}${
        advantage === 'advantage' ? ' · Ventaja en d20' : advantage === 'disadvantage' ? ' · Desventaja en d20' : ''
      }`;

  const handleRoll = async (overrideReq?: Omit<DiceRollRequest, 'requestId'>) => {
    if (!overrideReq && activeDice.length === 0) return;

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

    // En modo Varios, las marcas se mantienen para poder repetir la tirada

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

  // Tirada rápida de 1 dado al instante (modo "Un dado")
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
    } else if (mode === 'single') {
      handleQuickRoll('d20');
    } else if (activeDice.length > 0) {
      handleRoll();
    }
  };

  // Ventaja/Desventaja: visible en modo Un dado (para cuando se pulse d20) o en modo Varios si es exactamente 1d20
  const showAdvantageSelector = mode === 'single' || isSingleD20;

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

        {/* Selector de modo: Un dado y Varios */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`py-1.5 rounded-md transition-all cursor-pointer font-medium ${
              mode === 'single'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Un dado
          </button>
          <button
            type="button"
            onClick={() => setMode('multiple')}
            className={`py-1.5 rounded-md transition-all cursor-pointer font-medium ${
              mode === 'multiple'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Varios
          </button>
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
          {mode === 'multiple' && (
            <button
              type="button"
              onClick={handleClear}
              disabled={totalDice === 0 && !Object.values(selectedDice).some(Boolean)}
              className="text-[11px] font-medium text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-400 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="Limpiar todos los dados marcados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Lista de dados */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 block">
            {mode === 'single' ? 'Tirada rápida (haz clic para tirar):' : 'Marca los dados y ajusta cantidades:'}
          </label>

          {mode === 'single' ? (
            /* Modo "Un dado": Un clic tira ese dado al momento */
            <div className="grid grid-cols-4 gap-1.5">
              {DICE_LIST.map((die) => {
                const isD20 = die === 'd20';
                const label = getDieLabel(die);
                return (
                  <button
                    key={die}
                    type="button"
                    disabled={isRolling || (!isMaster && isFrozen)}
                    onClick={() => handleQuickRoll(die)}
                    className={`h-11 flex items-center justify-center rounded-lg border font-mono font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40 shadow-sm ${
                      die === 'd100' ? 'text-xs' : 'text-sm'
                    } ${
                      isD20
                        ? 'bg-sky-950/60 border-sky-500/70 text-sky-200 hover:bg-sky-600 hover:text-white hover:border-sky-400'
                        : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-400'
                    }`}
                    title={`Tirar 1${label}${modStr}${isD20 && advantage !== 'none' ? ` (${advantage === 'advantage' ? 'Ventaja' : 'Desventaja'})` : ''}`}
                  >
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Modo "Varios": Cada dado con casilla para marcarlo y contador de cantidad (- / +) */
            <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-0.5">
              {DICE_LIST.map((die) => {
                const isChecked = Boolean(selectedDice[die]);
                const count = counts[die] || 1;
                const label = getDieLabel(die);

                return (
                  <div
                    key={die}
                    onClick={() => toggleSelectDie(die)}
                    className={`rounded-lg border p-1.5 flex items-center justify-between gap-1.5 transition-all cursor-pointer select-none ${
                      die === 'd100' ? 'col-span-2' : ''
                    } ${
                      isChecked
                        ? 'bg-sky-950/60 border-sky-500/80 shadow-sm'
                        : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <label
                      className="flex items-center gap-1.5 cursor-pointer min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectDie(die)}
                        className="accent-sky-500 w-3.5 h-3.5 rounded cursor-pointer"
                      />
                      <span
                        className={`font-mono font-bold truncate ${
                          die === 'd100' ? 'text-xs' : 'text-xs'
                        } ${isChecked ? 'text-sky-300' : 'text-slate-300'}`}
                      >
                        {label}
                      </span>
                    </label>

                    <div
                      className="flex items-center bg-slate-950/90 rounded border border-slate-800 px-1 py-0.5 text-xs gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => updateDieCount(die, -1)}
                        disabled={count <= 1}
                        className="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer font-bold leading-none"
                        title="Reducir cantidad"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-slate-100 min-w-[14px] text-center text-xs">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDieCount(die, 1)}
                        disabled={count >= 20}
                        className="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer font-bold leading-none"
                        title="Aumentar cantidad"
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
            disabled={isRolling || (!isMaster && isFrozen) || (mode === 'multiple' && activeDice.length === 0)}
            onClick={() => (mode === 'multiple' ? handleRoll() : handleQuickRoll('d20'))}
            className="flex-1 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-sm shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Dices className="w-4 h-4" />
            <span>{isRolling ? 'Tirando...' : mode === 'multiple' ? 'Tirar' : 'Tirar 1d20'}</span>
          </button>

          <button
            type="button"
            disabled={isRolling || (!isMaster && isFrozen) || (!lastRequest && mode === 'multiple' && activeDice.length === 0)}
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


