import React, { useState } from 'react';
import { DieType, DiceRollRequest } from '../../types/dice';
import { diceManager } from '../../modules/dice/diceManager';
import { useGameStore } from '../../stores/useGameStore';
import { Dices, Volume2, VolumeX, EyeOff, RotateCcw, AlertCircle, X } from 'lucide-react';

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
  const [selectedDie, setSelectedDie] = useState<DieType>('d20');
  const [count, setCount] = useState<number>(1);
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

  const handleRoll = async (overrideReq?: Omit<DiceRollRequest, 'requestId'>) => {
    setWaitingWarning(null);
    setIsRolling(true);

    const req: Omit<DiceRollRequest, 'requestId'> = overrideReq || {
      rollerName: playerName,
      dieType: selectedDie,
      count,
      modifier,
      advantage: selectedDie === 'd20' ? advantage : 'none',
      isSecret: isMaster ? isSecret : false
    };

    setLastRequest(req);

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

  const handleRepeatLast = () => {
    if (lastRequest) {
      handleRoll(lastRequest);
    } else {
      handleRoll();
    }
  };

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

        {/* Selector de dado */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Tipo de dado:</label>
          <div className="grid grid-cols-4 gap-1.5">
            {DICE_LIST.map((die) => (
              <button
                key={die}
                type="button"
                onClick={() => {
                  setSelectedDie(die);
                  if (die !== 'd20') setAdvantage('none');
                }}
                className={`py-2 px-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                  selectedDie === die
                    ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                {die}
              </button>
            ))}
          </div>
        </div>

        {/* Cantidad y Modificador */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-300">Cantidad:</label>
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
              >
                -
              </button>
              <span className="flex-1 text-center font-mono text-sm font-semibold">{count}</span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.min(20, c + 1))}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-300">Modificador:</label>
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setModifier((m) => m - 1)}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
              >
                -
              </button>
              <span className="flex-1 text-center font-mono text-sm font-semibold">
                {modifier > 0 ? `+${modifier}` : modifier}
              </span>
              <button
                type="button"
                onClick={() => setModifier((m) => m + 1)}
                className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-bold cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Ventaja / Desventaja (solo para d20) */}
        {selectedDie === 'd20' && (
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
            disabled={isRolling || (!isMaster && isFrozen)}
            onClick={() => handleRoll()}
            className="flex-1 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Dices className="w-4 h-4" />
            <span>{isRolling ? 'Tirando...' : 'Tirar'}</span>
          </button>

          <button
            type="button"
            disabled={isRolling || (!isMaster && isFrozen)}
            onClick={handleRepeatLast}
            className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 text-xs font-semibold shadow transition-colors cursor-pointer flex items-center gap-1.5"
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
