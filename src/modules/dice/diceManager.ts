import { DieType, DiceRollRequest, DiceRollResult, SingleDieResult } from '../../types/dice';
import { playDiceRollSound } from './diceSound';
import { onlineRoomManager } from '../online/onlineRoomManager';
import { syncChannel } from '../sync/syncChannel';
import { useGameStore } from '../../stores/useGameStore';

const DIE_SIDES: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100
};

/**
 * Genera un número entero aleatorio en [min, max] usando crypto.getRandomValues
 */
export function generateRandomInteger(min: number, max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const range = max - min + 1;
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return min + (array[0] % range);
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class DiceManager {
  private history: DiceRollResult[] = [];
  private activeRolls: DiceRollResult[] = [];
  private rollListeners = new Set<(roll: DiceRollResult) => void>();
  private historyListeners = new Set<(history: DiceRollResult[]) => void>();
  private activeRollsListeners = new Set<(rolls: DiceRollResult[]) => void>();

  private isMutedState = false;
  private pendingRequests = new Map<string, { resolve: (r: DiceRollResult) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor() {
    try {
      this.isMutedState = typeof localStorage !== 'undefined' && localStorage.getItem('vtt_dice_muted') === 'true';
    } catch {
      this.isMutedState = false;
    }

    // Escuchar mensajes de sala online
    onlineRoomManager.onMessage((msg) => {
      if (msg.type === 'DICE_ROLL_REQUEST') {
        // Solo el máster genera el resultado
        if (typeof window !== 'undefined' && !window.location.search.includes('play=')) {
          this.handleIncomingRequest(msg.payload as DiceRollRequest);
        }
      } else if (msg.type === 'DICE_ROLL_RESULT') {
        this.handleIncomingResult(msg.payload as DiceRollResult);
      }
    });

    // Escuchar mensajes locales de TV/máster
    syncChannel.onDiceRoll((roll) => {
      this.handleIncomingResult(roll);
    });
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vtt_dice_muted', String(muted));
      }
    } catch {}
  }

  public getHistory(): DiceRollResult[] {
    return this.history;
  }

  public getActiveRolls(): DiceRollResult[] {
    return this.activeRolls;
  }

  public onRoll(cb: (roll: DiceRollResult) => void): () => void {
    this.rollListeners.add(cb);
    return () => this.rollListeners.delete(cb);
  }

  public onHistoryChange(cb: (history: DiceRollResult[]) => void): () => void {
    this.historyListeners.add(cb);
    cb(this.history);
    return () => this.historyListeners.delete(cb);
  }

  public onActiveRollsChange(cb: (rolls: DiceRollResult[]) => void): () => void {
    this.activeRollsListeners.add(cb);
    cb(this.activeRolls);
    return () => this.activeRollsListeners.delete(cb);
  }

  /**
   * Generación autoritaria de tiradas (ejecutada exclusivamente por el máster)
   */
  public generateRoll(req: DiceRollRequest): DiceRollResult {
    // Normalizar el pool de dados: usar dicePool si existe, o construir a partir de dieType y count
    const pool: { dieType: DieType; count: number }[] = req.dicePool && req.dicePool.length > 0
      ? req.dicePool.filter((item) => item.count > 0)
      : [{ dieType: req.dieType || 'd20', count: req.count || 1 }];

    const totalDiceCount = pool.reduce((acc, item) => acc + item.count, 0);
    const isSingleD20 = pool.length === 1 && pool[0].dieType === 'd20' && pool[0].count === 1;
    const advantage = isSingleD20 ? (req.advantage || 'none') : 'none';

    const dice: SingleDieResult[] = [];

    if (isSingleD20 && (advantage === 'advantage' || advantage === 'disadvantage')) {
      const v1 = generateRandomInteger(1, 20);
      const v2 = generateRandomInteger(1, 20);

      let keepFirst = true;
      if (advantage === 'advantage') {
        keepFirst = v1 >= v2;
      } else {
        keepFirst = v1 <= v2;
      }

      const d1: SingleDieResult = {
        dieType: 'd20',
        sides: 20,
        value: v1,
        dropped: !keepFirst,
        isNat20: keepFirst && v1 === 20,
        isNat1: keepFirst && v1 === 1
      };

      const d2: SingleDieResult = {
        dieType: 'd20',
        sides: 20,
        value: v2,
        dropped: keepFirst,
        isNat20: !keepFirst && v2 === 20,
        isNat1: !keepFirst && v2 === 1
      };

      dice.push(d1, d2);
    } else {
      // Si el pool contiene tanto d100 como d10, ordenar para que d100 preceda a d10
      if (pool.some((p) => p.dieType === 'd100') && pool.some((p) => p.dieType === 'd10')) {
        pool.sort((a, b) => {
          if (a.dieType === 'd100' && b.dieType === 'd10') return -1;
          if (a.dieType === 'd10' && b.dieType === 'd100') return 1;
          return 0;
        });
      }

      for (const item of pool) {
        const count = Math.max(1, Math.min(20, item.count));

        if (item.dieType === 'd100') {
          // El d100 es un único dado de decenas (00, 10, 20... 90)
          for (let i = 0; i < count; i++) {
            const rawTens = generateRandomInteger(0, 9) * 10; // 0, 10, 20... 90
            dice.push({
              dieType: 'd100',
              sides: 100,
              value: rawTens, // 00 es 0 si sale solo
              displayValue: rawTens === 0 ? '00' : `${rawTens}`
            });
          }
        } else {
          const sides = DIE_SIDES[item.dieType] || 20;
          for (let i = 0; i < count; i++) {
            const val = generateRandomInteger(1, sides);
            dice.push({
              dieType: item.dieType,
              sides,
              value: val,
              displayValue: `${val}`,
              isNat20: item.dieType === 'd20' && val === 20,
              isNat1: item.dieType === 'd20' && val === 1
            });
          }
        }
      }

      // Combinación percentil: si hay al menos un d100 y al menos un d10,
      // el primer d100 hace de decenas y el primer d10 actúa de unidades (su cara 10 cuenta como 0).
      // Si salen 00 y 10 (0), el resultado es 100.
      // Si hay más de un d10 (ej: d100 + 2d10), solo el primer d10 hace de unidades del percentil; los demás d10 se suman de forma normal (1 a 10).
      const tensIndex = dice.findIndex((d) => d.dieType === 'd100');
      const unitsIndex = dice.findIndex((d) => d.dieType === 'd10');

      if (tensIndex !== -1 && unitsIndex !== -1) {
        const tensDie = dice[tensIndex];
        const unitsDie = dice[unitsIndex];

        tensDie.isTensPercentile = true;
        unitsDie.isUnitsPercentile = true;

        const rawD10 = unitsDie.value; // 1 a 10
        const unitsVal = rawD10 === 10 ? 0 : rawD10; // su cara 10 cuenta como 0
        unitsDie.displayValue = `${unitsVal}`;

        const rawTens = tensDie.displayValue === '00' ? 0 : tensDie.value; // 0, 10, ..., 90

        if (rawTens === 0 && unitsVal === 0) {
          // Si salen 00 y 10 (0), el resultado del percentil es 100
          tensDie.value = 100;
          unitsDie.value = 0;
        } else {
          tensDie.value = rawTens;
          unitsDie.value = unitsVal;
        }

        // Asegurar que el dado de unidades esté inmediatamente después del de decenas para la fórmula
        if (unitsIndex !== tensIndex + 1) {
          const [removedUnits] = dice.splice(unitsIndex, 1);
          const newTensIndex = dice.indexOf(tensDie);
          dice.splice(newTensIndex + 1, 0, removedUnits);
        }
      }
    }

    const keptDice = dice.filter((d) => !d.dropped);
    const sumKept = keptDice.reduce((acc, d) => acc + d.value, 0);
    const total = sumKept + (req.modifier || 0);

    // Construcción de la fórmula textual con desglose explícito de decenas y unidades para d100
    const modStr = req.modifier > 0 ? `+${req.modifier}` : req.modifier < 0 ? `${req.modifier}` : '';
    const advStr = advantage === 'advantage' ? ' (Ventaja)' : advantage === 'disadvantage' ? ' (Desventaja)' : '';

    const poolFormula = pool.map((p) => `${p.count}${p.dieType}`).join(' + ') || `${req.count || 1}${req.dieType || 'd20'}`;

    const tokens: string[] = [];
    for (let i = 0; i < keptDice.length; i++) {
      const d = keptDice[i];
      const val = d.displayValue !== undefined ? d.displayValue : d.value;
      if (d.isTensPercentile) {
        tokens.push(`Decenas ${val}`);
      } else if (d.isUnitsPercentile) {
        if (tokens.length > 0 && keptDice[i - 1]?.isTensPercentile) {
          const prev = tokens.pop();
          tokens.push(`${prev} · Unidades ${val}`);
        } else {
          tokens.push(`Unidades ${val}`);
        }
      } else {
        tokens.push(`${val}`);
      }
    }
    const diceStr = tokens.join(' + ');
    const detailStr = req.modifier !== 0 ? `${diceStr} ${modStr}` : diceStr;
    const formula = `${req.rollerName}: ${poolFormula}${modStr}${advStr} → ${detailStr} = ${total}`;

    return {
      id: req.requestId || `roll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      rollerName: req.rollerName,
      isSecret: req.isSecret,
      formula,
      dieType: pool[0]?.dieType || 'd20',
      dicePool: pool,
      dice,
      modifier: req.modifier || 0,
      total,
      advantage,
      timestamp: Date.now()
    };
  }

  /**
   * Ejecuta una tirada como máster y la retransmite a la sala online y a la tele
   */
  public executeMasterRoll(req: Omit<DiceRollRequest, 'requestId'>): DiceRollResult {
    const fullReq: DiceRollRequest = {
      ...req,
      requestId: `roll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };

    const result = this.generateRoll(fullReq);

    // Si es tirada oculta, solo se muestra en el máster
    if (result.isSecret) {
      this.addRoll(result);
      return result;
    }

    // Sincronizar hacia tele local y sala online
    syncChannel.sendDiceRoll(result);
    if (onlineRoomManager.isRoomActive()) {
      onlineRoomManager.sendBroadcastMessage({
        type: 'DICE_ROLL_RESULT',
        payload: result
      });
    }

    this.addRoll(result);
    return result;
  }

  /**
   * Petición de tirada desde el jugador remoto (espera hasta 5s la respuesta autoritaria del máster)
   */
  public requestRollAsPlayer(req: Omit<DiceRollRequest, 'requestId'>): Promise<DiceRollResult> {
    if (useGameStore.getState().game.remotePlayersFrozen) {
      return Promise.reject(new Error('La partida está en pausa por el máster'));
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullReq: DiceRollRequest = {
      ...req,
      requestId
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Esperando al máster...'));
      }, 5000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      onlineRoomManager.sendBroadcastMessage({
        type: 'DICE_ROLL_REQUEST',
        payload: fullReq
      });
    });
  }

  private handleIncomingRequest(req: DiceRollRequest): void {
    if (useGameStore.getState().game.remotePlayersFrozen) return;

    // El máster procesa la petición del jugador remoto
    const result = this.generateRoll(req);

    // Sincronizar hacia tele local y sala online
    syncChannel.sendDiceRoll(result);
    if (onlineRoomManager.isRoomActive()) {
      onlineRoomManager.sendBroadcastMessage({
        type: 'DICE_ROLL_RESULT',
        payload: result
      });
    }

    this.addRoll(result);
  }

  private handleIncomingResult(result: DiceRollResult): void {
    // Si teníamos una petición pendiente con este ID, resolverla
    const pending = this.pendingRequests.get(result.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(result.id);
      pending.resolve(result);
    }

    this.addRoll(result);
  }

  public dismissRoll(rollId: string): void {
    const beforeCount = this.activeRolls.length;
    this.activeRolls = this.activeRolls.filter((r) => r.id !== rollId);
    if (this.activeRolls.length !== beforeCount) {
      this.activeRollsListeners.forEach((cb) => cb(this.activeRolls));
    }
  }

  private addRoll(roll: DiceRollResult): void {
    // Reproducir sonido si no está silenciado
    playDiceRollSound(this.isMutedState);

    // Añadir a historial (últimas 50 tiradas)
    this.history = [roll, ...this.history.slice(0, 49)];
    this.historyListeners.forEach((cb) => cb(this.history));

    // Añadir a tiradas activas en pantalla
    this.activeRolls = [...this.activeRolls, roll];
    this.activeRollsListeners.forEach((cb) => cb(this.activeRolls));
    this.rollListeners.forEach((cb) => cb(roll));

    // Descarte de seguridad amplio (30s) por si no se cierra desde la UI
    setTimeout(() => {
      this.dismissRoll(roll.id);
    }, 30000);
  }
}

export const diceManager = new DiceManager();
