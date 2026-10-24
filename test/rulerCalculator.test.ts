import { describe, it, expect } from 'vitest';
import { calculateRulerDistance } from '../src/modules/tools/rulerCalculator';

describe('rulerCalculator', () => {
  const gridSize = 70;

  it('calcula distancia recta ortogonal', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 210, y: 0 }; // 3 casillas
    const result = calculateRulerDistance(start, end, gridSize, 'straight', '5e');
    expect(result.distanceSquares).toBe(3);
    expect(result.displayText).toBe('3 casillas · 15 pies');
  });

  it('calcula diagonales en regla 5e (Chebyshev)', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 140, y: 140 }; // 2 casillas en X, 2 en Y
    const result = calculateRulerDistance(start, end, gridSize, 'straight', '5e');
    expect(result.distanceSquares).toBe(2);
    expect(result.displayText).toBe('2 casillas · 10 pies');
  });

  it('calcula diagonales en regla alterna (1-2-1-2)', () => {
    const start = { x: 0, y: 0 };
    // 1 diagonal (70, 70): floor(1 * 1.5) = 1 casilla
    expect(calculateRulerDistance(start, { x: 70, y: 70 }, gridSize, 'straight', 'alternate').distanceSquares).toBe(1);

    // 2 diagonales (140, 140): floor(2 * 1.5) = 3 casillas
    expect(calculateRulerDistance(start, { x: 140, y: 140 }, gridSize, 'straight', 'alternate').distanceSquares).toBe(3);

    // 3 diagonales (210, 210): floor(3 * 1.5) = 4 casillas
    expect(calculateRulerDistance(start, { x: 210, y: 210 }, gridSize, 'straight', 'alternate').distanceSquares).toBe(4);

    // 4 diagonales (280, 280): floor(4 * 1.5) = 6 casillas
    expect(calculateRulerDistance(start, { x: 280, y: 280 }, gridSize, 'straight', 'alternate').distanceSquares).toBe(6);
  });

  it('calcula distancia euclídea continua en regla real con 1 decimal', () => {
    const start = { x: 0, y: 0 };
    // Triángulo 3 - 4 - 5 casillas: dx = 3*70 = 210, dy = 4*70 = 280 -> hipotenusa = 5*70 = 350 px -> 5 casillas
    const result = calculateRulerDistance(start, { x: 210, y: 280 }, gridSize, 'straight', 'real');
    expect(result.distanceSquares).toBe(5);
    expect(result.displayText).toBe('5 casillas · 25 pies');

    // 1 diagonal (70, 70): sqrt(2) * 70 / 70 ≈ 1.414 -> redondeado a 1.4
    const diag = calculateRulerDistance(start, { x: 70, y: 70 }, gridSize, 'straight', 'real');
    expect(diag.distanceSquares).toBe(1.4);
    expect(diag.displayText).toBe('1.4 casillas · 7 pies');
  });
});
