import { describe, it, expect } from 'vitest';
import { safeClip, sanitizeMultiPolygon, isValidMultiPolygon } from '../src/modules/vision/safeClip';
import { ExploredMultiPolygon } from '../src/types/game';

/**
 * Genera un polígono circular/elíptico con perturbaciones decimales,
 * coordenadas fraccionarias y vértices redundantes o casi coincidentes.
 */
function createRandomWobblyPolygon(cx: number, cy: number, radius: number, pointsCount = 24): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < pointsCount; i++) {
    const angle = (i / pointsCount) * Math.PI * 2;
    // Añadir perturbación decimal microscópica y oscilaciones
    const r = radius + (Math.sin(i * 3) * 5) + ((Math.random() - 0.5) * 0.732);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push([x, y]);
  }
  // Cerrar el anillo
  points.push([points[0][0], points[0][1]]);
  return points;
}

describe('safeClip Regression & Stress Testing', () => {
  it('unioning cientos de polígonos con decimales y bordes casi coincidentes jamás lanza excepción', () => {
    let result: ExploredMultiPolygon = [];
    let exceptionsCount = 0;

    // Generar 150 polígonos con solapamiento progresivo y desplazamientos flotantes
    const numPolygons = 150;
    for (let i = 0; i < numPolygons; i++) {
      try {
        const cx = 500 + (Math.sin(i * 0.2) * 120) + (i * 1.5) + (Math.random() * 0.1);
        const cy = 500 + (Math.cos(i * 0.2) * 120) + (Math.random() * 0.1);
        const radius = 60 + ((i % 5) * 3) + Math.random();

        const polyRing = createRandomWobblyPolygon(cx, cy, radius, 20);
        const newPoly: ExploredMultiPolygon = [[polyRing]];

        result = safeClip.union(result, newPoly);
      } catch (e) {
        console.error('Exception thrown during stress union at iteration', i, e);
        exceptionsCount++;
      }
    }

    expect(exceptionsCount).toBe(0);
    expect(result.length).toBeGreaterThan(0);
    expect(safeClip.validate(result)).toBe(true);
  });

  it('diferencias e intersecciones sucesivas con micro-geometrías nunca lanzan excepción', () => {
    let base: ExploredMultiPolygon = [
      [[
        [0.123, 0.456],
        [200.789, 0.111],
        [200.555, 200.222],
        [0.888, 200.999],
        [0.123, 0.456]
      ]]
    ];

    for (let i = 0; i < 30; i++) {
      const cutOut: ExploredMultiPolygon = [
        [[
          [50.0001 + i * 2, 50.0002],
          [70.0003 + i * 2, 50.0001],
          [70.0002 + i * 2, 70.0005],
          [50.0004 + i * 2, 70.0002],
          [50.0001 + i * 2, 50.0002]
        ]]
      ];

      expect(() => {
        base = safeClip.difference(base, cutOut);
      }).not.toThrow();
    }

    expect(base.length).toBeGreaterThan(0);
    expect(safeClip.validate(base)).toBe(true);
  });

  it('gestiona anillos degenerados, vacíos o colineales sin errores', () => {
    // Anillo con 2 puntos
    const degen1 = [[[ [0, 0], [10, 10], [0, 0] ]]];
    // Anillo con área 0 (colineal)
    const degen2 = [[[ [0, 0], [10, 0], [20, 0], [10, 0], [0, 0] ]]];
    // Array vacío o corrupto
    const degen3: any = [[[ [] ]]];

    expect(() => {
      const sanitized = sanitizeMultiPolygon(degen1);
      expect(sanitized).toEqual([]);
    }).not.toThrow();

    expect(() => {
      const res = safeClip.union(degen1, degen2, degen3);
      expect(res).toEqual([]);
    }).not.toThrow();
  });
});
