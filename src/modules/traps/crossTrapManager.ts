import { useGameStore } from '../../stores/useGameStore';
import { useUIStore } from '../../stores/useUIStore';
import { diceManager } from '../dice/diceManager';

interface TokenPrevPosition {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface LastLaunchRecord {
  trapEntityId: string;
  tokens: TokenPrevPosition[];
  timestamp: number;
}

export class CrossTrapManager {
  private lastLaunch: LastLaunchRecord | null = null;

  /**
   * Activa la trampa de puerta giratoria en X:
   * 1. Tira 1d4 sincronizado (visible en tele y sala online).
   * 2. Inicia giro suave con frenado hacia el pasillo (1=Norte, 2=Este, 3=Sur, 4=Oeste).
   * 3. Atrapa y expulsa cualquier token en el cruce sin gastar movimiento del jugador.
   * 4. Muestra aviso con botón "Deshacer lanzamiento".
   */
  public trigger(trapEntityId: string): void {
    const game = useGameStore.getState().game;
    const trapEntity = game.entities.find((e) => e.id === trapEntityId);
    if (!trapEntity || trapEntity.type !== 'effect') return;

    // 1. Tirada 1d4 visible y sincronizada
    const rollResult = diceManager.executeMasterRoll({
      rollerName: 'Trampa de Cruce',
      dicePool: [{ dieType: 'd4', count: 1 }],
      modifier: 0,
      advantage: 'none',
      isSecret: false
    });

    const d4 = Math.max(1, Math.min(4, rollResult.total));

    // 2. Mapeo de pasillos (1=Norte, 2=Este, 3=Sur, 4=Oeste)
    // Relativo a la orientación inicial de la cruz:
    // Norte: -90° (-PI/2), Este: 0°, Sur: +90° (+PI/2), Oeste: 180° (PI)
    const corridorAngles: Record<number, number> = {
      1: -Math.PI / 2, // Norte
      2: 0,            // Este
      3: Math.PI / 2,  // Sur
      4: Math.PI       // Oeste
    };

    const corridorNames: Record<number, string> = {
      1: 'Norte',
      2: 'Este',
      3: 'Sur',
      4: 'Oeste'
    };

    const corridorName = corridorNames[d4] || 'Norte';
    const relativeAngle = corridorAngles[d4] ?? -Math.PI / 2;

    const currentRot = trapEntity.rotation || 0;
    // 2.5 vueltas completas y frena en la orientación hacia el pasillo
    const spins = 2.5;
    const targetRot = currentRot + Math.PI * 2 * spins + relativeAngle;

    // 3. Detectar tokens en la intersección y expulsarlos
    const parentMap = trapEntity.mapId ? game.entities.find((e) => e.id === trapEntity.mapId) : undefined;
    const gridSize = parentMap?.mapData?.pixelsPerGrid ?? (game.grid.size > 0 ? game.grid.size : 70);
    const trapGridSize = trapEntity.effect?.trapGridSize ?? 3;
    const crossRadius = (trapGridSize / 2) * gridSize * (trapEntity.scaleX || 1);

    const tokensToLaunch: TokenPrevPosition[] = [];
    for (const ent of game.entities) {
      if (ent.type === 'token') {
        const dist = Math.hypot(ent.x - trapEntity.x, ent.y - trapEntity.y);
        if (dist <= crossRadius * 1.05) {
          tokensToLaunch.push({
            id: ent.id,
            name: ent.name,
            x: ent.x,
            y: ent.y
          });
        }
      }
    }

    // Calcular destino de expulsión
    const launchCells = trapEntity.effect?.launchDistance ?? 2;
    const ejectionDistance = crossRadius + launchCells * gridSize;
    const exitAngleWorld = currentRot + relativeAngle;
    const dirX = Math.cos(exitAngleWorld);
    const dirY = Math.sin(exitAngleWorld);

    for (const tok of tokensToLaunch) {
      const rawTargetX = trapEntity.x + dirX * ejectionDistance;
      const rawTargetY = trapEntity.y + dirY * ejectionDistance;

      // Encajar en la casilla
      const snappedX = Math.round((rawTargetX - gridSize / 2) / gridSize) * gridSize + gridSize / 2;
      const snappedY = Math.round((rawTargetY - gridSize / 2) / gridSize) * gridSize + gridSize / 2;

      // Actualizar posición DIRECTAMENTE sin debitar movimiento de jugador
      useGameStore.getState().updateEntity(tok.id, { x: snappedX, y: snappedY }, true);
    }

    // 4. Iniciar animación de giro
    const spinStartTime = Date.now();
    const spinDurationMs = 2200;

    useGameStore.getState().updateEntity(
      trapEntityId,
      {
        effect: {
          ...trapEntity.effect!,
          crossSpinning: true,
          crossSpinStartTime: spinStartTime,
          crossSpinStartAngle: currentRot,
          crossTargetAngle: targetRot,
          trapTriggerTime: spinStartTime
        }
      },
      true
    );

    // Finalizar rotación en el almacén al terminar el giro (las paredes se actualizan aquí)
    setTimeout(() => {
      const currentEntities = useGameStore.getState().game.entities;
      const currentTrap = currentEntities.find((e) => e.id === trapEntityId);
      if (currentTrap && currentTrap.effect?.crossSpinning) {
        const TWO_PI = Math.PI * 2;
        const normalizedRot = ((targetRot % TWO_PI) + TWO_PI) % TWO_PI;
        useGameStore.getState().updateEntity(
          trapEntityId,
          {
            rotation: normalizedRot,
            effect: {
              ...currentTrap.effect,
              crossSpinning: false
            }
          },
          true
        );
      }
    }, spinDurationMs + 50);

    // Guardar para deshacer
    this.lastLaunch = {
      trapEntityId,
      tokens: tokensToLaunch,
      timestamp: Date.now()
    };

    // 5. Aviso en pantalla de máster con botón "Deshacer lanzamiento"
    const count = tokensToLaunch.length;
    const countMsg = count > 0 ? ` (${count} token${count > 1 ? 's' : ''} expulsado${count > 1 ? 's' : ''})` : '';

    useUIStore.getState().addToast(
      `Trampa de cruce: d4 = ${d4} → Pasillo ${corridorName}${countMsg}`,
      'warning',
      9000,
      count > 0
        ? {
            label: 'Deshacer lanzamiento',
            onClick: () => this.undoLaunch(trapEntityId)
          }
        : undefined
    );
  }

  /**
   * Deshace el último lanzamiento de tokens de la trampa
   */
  public undoLaunch(trapEntityId?: string): void {
    if (!this.lastLaunch) return;
    if (trapEntityId && this.lastLaunch.trapEntityId !== trapEntityId) return;

    for (const tok of this.lastLaunch.tokens) {
      useGameStore.getState().updateEntity(tok.id, { x: tok.x, y: tok.y }, true);
    }

    useUIStore.getState().addToast('Lanzamiento deshecho: tokens devueltos al cruce', 'info', 2500);
    this.lastLaunch = null;
  }

  public getLastLaunch(): LastLaunchRecord | null {
    return this.lastLaunch;
  }
}

export const crossTrapManager = new CrossTrapManager();
