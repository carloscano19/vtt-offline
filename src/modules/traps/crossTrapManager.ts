import { Entity } from '../../types/entity';
import { useGameStore } from '../../stores/useGameStore';

/**
 * Calcula el ángulo actual de rotación de la puerta giratoria en X (en radianes),
 * sincronizado a partir de una marca de tiempo compartida (crossStartTime).
 *
 * Máster, Tele y Jugador Remoto calculan el mismo ángulo exacto sin desincronización.
 * Si la rotación está en pausa, devuelve la rotación base fija.
 */
export function getCrossTrapAngle(entity: Entity, now: number = Date.now()): number {
  if (entity.type !== 'effect' || entity.effect?.preset !== 'cross_revolving_door') {
    return entity.rotation || 0;
  }

  const effect = entity.effect;
  const animRot = entity.animations?.rotation;

  // Si está en pausa, queda fija en su rotación base
  if (effect?.crossPaused) {
    return entity.rotation || 0;
  }

  // Velocidad: por defecto 6 segundos por vuelta
  let speedSec = 6;
  if (typeof effect?.crossSpeed === 'number' && effect.crossSpeed > 0) {
    speedSec = effect.crossSpeed;
  } else if (typeof animRot?.speed === 'number' && animRot.speed > 0) {
    speedSec = 1 / animRot.speed;
  }

  // Sentido: horario ('cw') o antihorario ('ccw')
  const direction: 'cw' | 'ccw' = effect?.crossDirection ?? animRot?.direction ?? 'cw';
  const dirMultiplier = direction === 'ccw' ? -1 : 1;

  // Velocidad angular en rad/s: (2 * PI / speedSec)
  const rotSpeed = ((Math.PI * 2) / speedSec) * dirMultiplier;

  // Hora de inicio compartida (ms)
  const startTime = effect?.crossStartTime ?? animRot?.startTime ?? 0;
  const elapsedSec = startTime > 0 ? (now - startTime) / 1000 : (now / 1000);

  return (entity.rotation || 0) + elapsedSec * rotSpeed;
}

/**
 * Calcula la rotación adicional para cualquier entidad con "Rotación continua" genérica (animations.rotation).
 */
export function getGenericRotationAngle(entity: Entity, now: number = Date.now()): number {
  const animRot = entity.animations?.rotation;
  if (!animRot?.enabled) return 0;

  const vps = animRot.speed ?? 0.2;
  const dirMultiplier = animRot.direction === 'ccw' ? -1 : 1;
  const rotSpeed = vps * (Math.PI * 2) * dirMultiplier;

  const startTime = animRot.startTime ?? 0;
  const elapsedSec = startTime > 0 ? (now - startTime) / 1000 : (now / 1000);
  return elapsedSec * rotSpeed;
}

export class CrossTrapManager {
  /**
   * Alterna el estado de pausa / reanudación de la puerta giratoria en X.
   * Al pausar, congela los brazos en el ángulo actual.
   * Al reanudar, continúa girando suavemente desde ese ángulo.
   */
  public togglePause(trapEntityId: string): void {
    const game = useGameStore.getState().game;
    const trapEntity = game.entities.find((e) => e.id === trapEntityId);
    if (!trapEntity || trapEntity.type !== 'effect') return;

    const isCurrentlyPaused = Boolean(trapEntity.effect?.crossPaused);
    const now = Date.now();

    if (!isCurrentlyPaused) {
      // PAUSAR: fijar la rotación actual como ángulo base congelado
      const currentAngle = getCrossTrapAngle(trapEntity, now);
      const TWO_PI = Math.PI * 2;
      const normalizedRot = ((currentAngle % TWO_PI) + TWO_PI) % TWO_PI;

      useGameStore.getState().updateEntity(
        trapEntityId,
        {
          rotation: normalizedRot,
          effect: {
            ...trapEntity.effect!,
            crossPaused: true
          }
        },
        true
      );
    } else {
      // REANUDAR: iniciar nueva rotación continua desde el ángulo actual
      useGameStore.getState().updateEntity(
        trapEntityId,
        {
          effect: {
            ...trapEntity.effect!,
            crossPaused: false,
            crossStartTime: now
          }
        },
        true
      );
    }
  }

  /**
   * Cambia la velocidad de rotación (segundos por vuelta)
   */
  public setSpeed(trapEntityId: string, speedSec: number): void {
    const game = useGameStore.getState().game;
    const trapEntity = game.entities.find((e) => e.id === trapEntityId);
    if (!trapEntity || trapEntity.type !== 'effect') return;

    const now = Date.now();
    const currentAngle = getCrossTrapAngle(trapEntity, now);
    const TWO_PI = Math.PI * 2;
    const normalizedRot = ((currentAngle % TWO_PI) + TWO_PI) % TWO_PI;

    useGameStore.getState().updateEntity(
      trapEntityId,
      {
        rotation: normalizedRot,
        effect: {
          ...trapEntity.effect!,
          crossSpeed: Math.max(0.5, speedSec),
          crossStartTime: now
        }
      },
      true
    );
  }

  /**
   * Cambia el sentido de rotación (horario o antihorario)
   */
  public setDirection(trapEntityId: string, direction: 'cw' | 'ccw'): void {
    const game = useGameStore.getState().game;
    const trapEntity = game.entities.find((e) => e.id === trapEntityId);
    if (!trapEntity || trapEntity.type !== 'effect') return;

    const now = Date.now();
    const currentAngle = getCrossTrapAngle(trapEntity, now);
    const TWO_PI = Math.PI * 2;
    const normalizedRot = ((currentAngle % TWO_PI) + TWO_PI) % TWO_PI;

    useGameStore.getState().updateEntity(
      trapEntityId,
      {
        rotation: normalizedRot,
        effect: {
          ...trapEntity.effect!,
          crossDirection: direction,
          crossStartTime: now
        }
      },
      true
    );
  }
}

export const crossTrapManager = new CrossTrapManager();
