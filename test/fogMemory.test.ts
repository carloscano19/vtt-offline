import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon } from '../src/modules/vision/visibilityPolygon';
import { unionExplored, countVertices, isPointInMulti, hideRect, revealRect } from '../src/modules/vision/fogMemory';
import { ExploredMultiPolygon } from '../src/types/game';

const RANGE = 5 * 70;
const vis = (x: number, y: number) => computeVisibilityPolygon({ x, y }, RANGE, []);

describe('Memoria de exploración (unión geométrica)', () => {
  it('mover un token por tres posiciones deja las tres zonas exploradas', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 }
    ];
    let explored: ExploredMultiPolygon = [];
    for (const p of positions) explored = unionExplored(explored, [vis(p.x, p.y)]);

    expect(explored.length).toBe(3);
    for (const p of positions) expect(isPointInMulti(p, explored)).toBe(true);
    expect(isPointInMulti({ x: 500, y: 500 }, explored)).toBe(false);
  });

  it('volver a una posición no aumenta los vértices de forma significativa', () => {
    let explored: ExploredMultiPolygon = [];
    explored = unionExplored(explored, [vis(0, 0)]);
    explored = unionExplored(explored, [vis(1000, 0)]);
    explored = unionExplored(explored, [vis(0, 1000)]);
    const before = countVertices(explored);

    for (let i = 0; i < 5; i++) explored = unionExplored(explored, [vis(0, 0)]);
    const after = countVertices(explored);

    expect(after).toBeLessThanOrEqual(before * 1.05 + 4);
  });

  it('posiciones solapadas se funden en un único polígono sin crecer sin control', () => {
    let explored: ExploredMultiPolygon = [];
    for (let i = 0; i < 20; i++) explored = unionExplored(explored, [vis(i * 20, 0)]);
    expect(explored.length).toBe(1);
    expect(countVertices(explored)).toBeLessThan(200);
  });

  it('revelar y ocultar zona usan unión y diferencia', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    let explored = revealRect([], rect);
    expect(isPointInMulti({ x: 50, y: 50 }, explored)).toBe(true);
    explored = hideRect(explored, { x: 40, y: 40, width: 20, height: 20 });
    expect(isPointInMulti({ x: 50, y: 50 }, explored)).toBe(false);
    expect(isPointInMulti({ x: 10, y: 10 }, explored)).toBe(true);
  });
});
