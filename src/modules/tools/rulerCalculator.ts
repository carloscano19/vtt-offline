import { Point2D } from '../../types/entity';
import { DiagonalRule, RulerMode } from '../../types/game';

export interface RulerMeasurement {
  distanceSquares: number;
  displayText: string;
  stepsX: number;
  stepsY: number;
  pixelDistance: number;
}

/**
 * Calcula la distancia en casillas entre dos puntos.
 */
export function calculateRulerDistance(
  start: Point2D,
  end: Point2D,
  gridSize: number,
  mode: RulerMode,
  diagonalRule: DiagonalRule
): RulerMeasurement {
  if (gridSize <= 0) gridSize = 70;

  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const pixelDistance = Math.hypot(dx, dy);

  if (mode === 'radial') {
    const radiusSquares = pixelDistance / gridSize;
    const roundedSquares = Math.round(radiusSquares * 10) / 10;
    const feet = Math.round(roundedSquares * 5 * 10) / 10;
    return {
      distanceSquares: roundedSquares,
      displayText: `r = ${roundedSquares} casillas · ${feet} pies`,
      stepsX: Math.round(dx / gridSize),
      stepsY: Math.round(dy / gridSize),
      pixelDistance
    };
  }

  // Modo línea recta con casillas discretas
  const stepsX = Math.round(dx / gridSize);
  const stepsY = Math.round(dy / gridSize);

  let distanceSquares = 0;
  let displayText = '';

  if (diagonalRule === 'real') {
    // Distancia euclídea continua en casillas con 1 decimal
    const dist = Math.round((pixelDistance / gridSize) * 10) / 10;
    const feet = Math.round(dist * 5 * 10) / 10;
    distanceSquares = dist;
    displayText = `${dist} casillas · ${feet} pies`;
  } else if (diagonalRule === '5e') {
    // Regla D&D 5e: Todas las diagonales cuentan como 1 casilla (distancia Chebyshev)
    distanceSquares = Math.max(stepsX, stepsY);
    const feet = distanceSquares * 5;
    displayText = `${distanceSquares} ${distanceSquares === 1 ? 'casilla' : 'casillas'} · ${feet} pies`;
  } else {
    // Regla alterna (1-2-1-2 / D&D 3.5 / Pathfinder):
    const diagonals = Math.min(stepsX, stepsY);
    const straights = Math.max(stepsX, stepsY) - diagonals;
    distanceSquares = straights + Math.floor(diagonals * 1.5);
    const feet = distanceSquares * 5;
    displayText = `${distanceSquares} ${distanceSquares === 1 ? 'casilla' : 'casillas'} · ${feet} pies`;
  }

  return {
    distanceSquares,
    displayText,
    stepsX,
    stepsY,
    pixelDistance
  };
}
