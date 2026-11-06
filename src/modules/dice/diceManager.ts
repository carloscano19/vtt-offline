import { DieType, DiceRollRequest, DiceRollResult, SingleDieResult } from '../../types/dice';
import { playDiceRollSound } from './diceSound';
import { onlineRoomManager } from '../online/onlineRoomManager';
import { syncChannel } from '../sync/syncChannel';

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
    const sides = DIE_SIDES[req.dieType] || 20;
    const dice: SingleDieResult[] = [];

    if (req.dieType === 'd20' && (req.advantage === 'advantage' || req.advantage === 'disadvantage')) {
      const v1 = generateRandomInteger(1, 20);
      const v2 = generateRandomInteger(1, 20);

      let keepFirst = true;
      if (req.advantage === 'advantage') {
        keepFirst = v1 >= v2;
      } else {
        keepFirst = v1 <= v2;
      }

      const d1: SingleDieResult = {
        sides: 20,
        value: v1,
        dropped: !keepFirst,
        isNat20: keepFirst && v1 === 20,
        isNat1: keepFirst && v1 === 1
      };

      const d2: SingleDieResult = {
        sides: 20,
        value: v2,
        dropped: keepFirst,
        isNat20: !keepFirst && v2 === 20,
        isNat1: !keepFirst && v2 === 1
      };

      dice.push(d1, d2);
    } else {
      const count = Math.max(1, Math.min(20, req.count || 1));
      for (let i = 0; i < count; i++) {
        const val = generateRandomInteger(1, sides);
        dice.push({
          sides,
          value: val,
          isNat20: sides === 20 && val === 20,
          isNat1: sides === 20 && val === 1
        });
      }
    }

    const keptDice = dice.filter((d) => !d.dropped);
    const sumKept = keptDice.reduce((acc, d) => acc + d.value, 0);
    const total = sumKept + (req.modifier || 0);

    // Construcción de la fórmula textual
    const modStr = req.modifier > 0 ? `+${req.modifier}` : req.modifier < 0 ? `${req.modifier}` : '';
    const advStr = req.advantage === 'advantage' ? ' (Ventaja)' : req.advantage === 'disadvantage' ? ' (Desventaja)' : '';
    const diceStr = keptDice.map((d) => d.value).join(' + ');
    const detailStr = req.modifier !== 0 ? `${diceStr} ${modStr}` : diceStr;
    const countPrefix = req.dieType === 'd20' && req.advantage !== 'none' ? '1' : `${req.count || 1}`;
    const formula = `${req.rollerName}: ${countPrefix}${req.dieType}${modStr}${advStr} → ${detailStr} = ${total}`;

    return {
      id: req.requestId || `roll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      rollerName: req.rollerName,
      isSecret: req.isSecret,
      formula,
      dieType: req.dieType,
      dice,
      modifier: req.modifier || 0,
      total,
      advantage: req.advantage,
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

    // Desvanecer y retirar tras 6 segundos
    setTimeout(() => {
      this.activeRolls = this.activeRolls.filter((r) => r.id !== roll.id);
      this.activeRollsListeners.forEach((cb) => cb(this.activeRolls));
    }, 6000);
  }
}

export const diceManager = new DiceManager();
