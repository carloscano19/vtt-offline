import { describe, it, expect } from 'vitest';
import { parseUVTT } from '../src/modules/import/uvttParser';

describe('uvttParser', () => {
  const dummyUVTT = JSON.stringify({
    format: 0.2,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: 10, y: 10 },
      pixels_per_grid: 100
    },
    image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    line_of_sight: [
      [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 5, y: 5 }
      ]
    ],
    portals: [
      {
        position: { x: 2, y: 1 },
        bounds: [
          { x: 1.5, y: 1 },
          { x: 2.5, y: 1 }
        ],
        rotation: 0,
        closed: true
      }
    ],
    lights: [
      {
        position: { x: 3, y: 3 },
        range: 4,
        color: 'ffaa00',
        intensity: 0.8
      }
    ]
  });

  it('parsea correctamente resolución y dimensiones en píxeles', () => {
    const result = parseUVTT(dummyUVTT);
    expect(result.pixelsPerGrid).toBe(100);
    expect(result.gridWidth).toBe(10);
    expect(result.gridHeight).toBe(10);
    expect(result.widthPx).toBe(1000);
    expect(result.heightPx).toBe(1000);
  });

  it('convierte paredes de casillas a píxeles locales', () => {
    const result = parseUVTT(dummyUVTT);
    expect(result.mapData.walls.length).toBe(2);
    // Primera pared: (1,1) -> (5,1) => (100, 100) -> (500, 100)
    expect(result.mapData.walls[0].p1).toEqual({ x: 100, y: 100 });
    expect(result.mapData.walls[0].p2).toEqual({ x: 500, y: 100 });
    // Segunda pared: (5,1) -> (5,5) => (500, 100) -> (500, 500)
    expect(result.mapData.walls[1].p1).toEqual({ x: 500, y: 100 });
    expect(result.mapData.walls[1].p2).toEqual({ x: 500, y: 500 });
  });

  it('convierte portales y luces a coordenadas locales y píxeles', () => {
    const result = parseUVTT(dummyUVTT);
    expect(result.mapData.portals.length).toBe(1);
    expect(result.mapData.portals[0].position).toEqual({ x: 200, y: 100 });
    expect(result.mapData.portals[0].bounds[0]).toEqual({ x: 150, y: 100 });
    expect(result.mapData.portals[0].bounds[1]).toEqual({ x: 250, y: 100 });

    expect(result.mapData.lights.length).toBe(1);
    expect(result.mapData.lights[0].position).toEqual({ x: 300, y: 300 });
    expect(result.mapData.lights[0].range).toBe(400); // 4 * 100
    expect(result.mapData.lights[0].color).toBe('#ffaa00');
  });

  it('decodifica la imagen en un Blob válido', () => {
    const result = parseUVTT(dummyUVTT);
    expect(result.imageBlob).toBeInstanceOf(Blob);
    expect(result.imageBlob.size).toBeGreaterThan(0);
  });
});
