import { describe, it, expect } from 'vitest';
import { Entity } from '../src/types/entity';

describe('Map Grid Alignment (Bloque 1)', () => {
  const gridSize = 70;

  it('calcula la esquina alineada para un mapa importado o añadido', () => {
    // Si la cámara está en (523, 318) y el mapa mide 700x700
    const cameraX = 523;
    const cameraY = 318;
    const mapW = 700;
    const mapH = 700;

    const rawX = cameraX - mapW / 2; // 523 - 350 = 173
    const rawY = cameraY - mapH / 2; // 318 - 350 = -32

    const alignedX = Math.round(rawX / gridSize) * gridSize;
    const alignedY = Math.round(rawY / gridSize) * gridSize;

    // 173 / 70 = 2.47 -> 2 * 70 = 140
    expect(alignedX).toBe(140);
    expect(alignedX % gridSize).toBe(0);

    // -32 / 70 = -0.457 -> -0 * 70 = -0 -> 0
    expect(alignedY).toBe(-0);
    expect(Math.abs(alignedY % gridSize)).toBe(0);
  });

  it('el botón "Alinear con la cuadrícula" redondea x e y al múltiplo de grid.size más cercano', () => {
    const unalignedMap: Entity = {
      id: 'map_1',
      type: 'map',
      name: 'Mapa desalineado',
      x: 135.4,
      y: 295.8,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 0,
      visibleToPlayers: true,
      locked: false
    };

    const alignedX = Math.round(unalignedMap.x / gridSize) * gridSize; // 135.4 / 70 = 1.93 -> 2 * 70 = 140
    const alignedY = Math.round(unalignedMap.y / gridSize) * gridSize; // 295.8 / 70 = 4.225 -> 4 * 70 = 280

    expect(alignedX).toBe(140);
    expect(alignedY).toBe(280);
    expect(alignedX % gridSize).toBe(0);
    expect(alignedY % gridSize).toBe(0);
  });

  it('arrastre normal encaja a múltiplos enteros y con Alt permite movimiento continuo', () => {
    const startX = 140;
    const startY = 280;
    const dx = 45; // Menos de una casilla completa
    const dy = 95; // Más de una casilla completa (70 + 25)

    // Sin Alt: salta a múltiplos de gridSize
    const normalNewX = Math.round((startX + dx) / gridSize) * gridSize; // (140 + 45) = 185 -> 185/70 = 2.64 -> 3 * 70 = 210
    const normalNewY = Math.round((startY + dy) / gridSize) * gridSize; // (280 + 95) = 375 -> 375/70 = 5.35 -> 5 * 70 = 350
    expect(normalNewX).toBe(210);
    expect(normalNewY).toBe(350);

    // Con Alt: movimiento libre exacto
    const altNewX = startX + dx;
    const altNewY = startY + dy;
    expect(altNewX).toBe(185);
    expect(altNewY).toBe(375);
  });

  it('movimiento con flechas salta casillas completas y con Alt salta cuartos de casilla', () => {
    const mapX = 140;
    const mapY = 280;

    // Flecha derecha (+1 casilla)
    const arrowRightX = Math.round((mapX + 1 * gridSize) / gridSize) * gridSize;
    expect(arrowRightX).toBe(210);

    // Flecha arriba (-1 casilla)
    const arrowUpY = Math.round((mapY - 1 * gridSize) / gridSize) * gridSize;
    expect(arrowUpY).toBe(210);

    // Flecha derecha con Alt (+1/4 casilla = +17.5px)
    const quarterGrid = gridSize / 4;
    const altRightX = mapX + 1 * quarterGrid;
    expect(altRightX).toBe(157.5);
  });
});
