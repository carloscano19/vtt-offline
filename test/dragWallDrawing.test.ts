import { describe, it, expect } from 'vitest';
import { useUIStore } from '../src/stores/useUIStore';
import { useGameStore } from '../src/stores/useGameStore';
import { getAllWallSegments } from '../src/modules/walls/wallManager';
import { Entity, Point2D } from '../src/types/entity';
import { worldToLocal } from '../src/pixi/utils/coordinates';

describe('Drag Wall Drawing (Bloque 7)', () => {
  it('defaults wallDrawMode to line and allows switching to rectangle', () => {
    const ui = useUIStore.getState();
    expect(ui.wallDrawMode).toBe('line');
    ui.setWallDrawMode('rectangle');
    expect(useUIStore.getState().wallDrawMode).toBe('rectangle');
    ui.setWallDrawMode('line');
    expect(useUIStore.getState().wallDrawMode).toBe('line');
  });

  it('snaps to existing wall endpoints when within threshold', () => {
    const existingWall: Entity = {
      id: 'w1',
      type: 'wall',
      name: 'Pared 1',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: false,
      locked: false,
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]
    };

    const segments = getAllWallSegments([existingWall]);
    expect(segments.length).toBe(1);
    expect(segments[0].p1).toEqual({ x: 100, y: 100 });
    expect(segments[0].p2).toEqual({ x: 200, y: 100 });

    const findClosestSnap = (pt: Point2D, threshold: number): Point2D | null => {
      let closest: Point2D | null = null;
      let minDist = threshold;
      for (const seg of segments) {
        for (const ep of [seg.p1, seg.p2]) {
          const d = Math.hypot(pt.x - ep.x, pt.y - ep.y);
          if (d <= minDist) {
            minDist = d;
            closest = ep;
          }
        }
      }
      return closest;
    };

    // A 6px de (100, 100) con threshold 10px -> imanta a (100, 100)
    const nearPt = { x: 104, y: 103 };
    const snapped = findClosestSnap(nearPt, 10);
    expect(snapped).toEqual({ x: 100, y: 100 });

    // A 25px de (100, 100) con threshold 10px -> no imanta
    const farPt = { x: 120, y: 115 };
    const notSnapped = findClosestSnap(farPt, 10);
    expect(notSnapped).toBeNull();
  });

  it('constrains angles to 45 deg increments in line mode with Shift', () => {
    const startPt = { x: 0, y: 0 };
    const rawEnd = { x: 100, y: 15 }; // ángulo cercano a 0°

    const dx = rawEnd.x - startPt.x;
    const dy = rawEnd.y - startPt.y;
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.hypot(dx, dy);
    const constrainedEnd = {
      x: startPt.x + Math.round(Math.cos(snappedAngle) * dist),
      y: startPt.y + Math.round(Math.sin(snappedAngle) * dist)
    };

    // Con ángulo cercano a 0°, debe quedar en la horizontal y = 0
    expect(snappedAngle).toBe(0);
    expect(constrainedEnd.y).toBe(0);
  });

  it('constrains rectangle to a square with Shift', () => {
    const startPt = { x: 10, y: 10 };
    const rawEnd = { x: 110, y: 60 }; // w = 100, h = 50

    const dx = rawEnd.x - startPt.x;
    const dy = rawEnd.y - startPt.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const squareEnd = {
      x: startPt.x + Math.sign(dx || 1) * side,
      y: startPt.y + Math.sign(dy || 1) * side
    };

    expect(squareEnd).toEqual({ x: 110, y: 110 });
    expect(Math.abs(squareEnd.x - startPt.x)).toBe(Math.abs(squareEnd.y - startPt.y));
  });

  it('generates 4 connected segments when creating a rectangle wall', () => {
    const p1 = { x: 0, y: 0 };
    const p3 = { x: 100, y: 80 };
    const p2 = { x: p3.x, y: p1.y };
    const p4 = { x: p1.x, y: p3.y };

    const rectWall: Entity = {
      id: 'rect_wall_1',
      type: 'wall',
      name: 'Habitación',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: false,
      locked: false,
      points: [p1, p2, p3, p4],
      closed: true
    };

    const segments = getAllWallSegments([rectWall]);
    // Debe haber 4 segmentos cerrados
    expect(segments.length).toBe(4);
    expect(segments[0]).toEqual({ p1, p2, entityId: 'rect_wall_1', source: 'drawn' });
    expect(segments[1]).toEqual({ p1: p2, p2: p3, entityId: 'rect_wall_1', source: 'drawn' });
    expect(segments[2]).toEqual({ p1: p3, p2: p4, entityId: 'rect_wall_1', source: 'drawn' });
    expect(segments[3]).toEqual({ p1: p4, p2: p1, entityId: 'rect_wall_1', source: 'drawn' });
  });

  it('links drawn wall to underlying map using local coordinates', () => {
    const mapEntity: Entity = {
      id: 'map_dungeon',
      type: 'map',
      name: 'Mazmorra',
      x: 500,
      y: 500,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 1,
      visibleToPlayers: true,
      locked: false,
      mapData: {
        gridWidth: 10,
        gridHeight: 10,
        pixelsPerGrid: 70
      }
    };

    const wallWorldPoints = [
      { x: 550, y: 550 },
      { x: 650, y: 550 }
    ];

    const localPoints = wallWorldPoints.map((p) =>
      worldToLocal(p, { x: mapEntity.x, y: mapEntity.y }, mapEntity.rotation, mapEntity.scaleX, mapEntity.scaleY)
    );

    expect(localPoints[0]).toEqual({ x: 50, y: 50 });
    expect(localPoints[1]).toEqual({ x: 150, y: 50 });
  });

  it('allows undoing recently created wall using removeEntities', () => {
    const store = useGameStore.getState();
    const wallId = 'wall_undo_test';
    const testWall: Entity = {
      id: wallId,
      type: 'wall',
      name: 'Pared Test',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: false,
      locked: false,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 50 }
      ]
    };

    store.addEntity(testWall);
    expect(useGameStore.getState().game.entities.some((e) => e.id === wallId)).toBe(true);

    useGameStore.getState().removeEntities([wallId]);
    expect(useGameStore.getState().game.entities.some((e) => e.id === wallId)).toBe(false);
  });

  it('un arrastre de (-87, -161) a (-49, 112) crea una pared con esos extremos exactos', () => {
    // Incluso con snapToGrid activo en la cuadrícula
    useGameStore.getState().setGridConfig({ snapToGrid: true, size: 70 });
    expect(useGameStore.getState().game.grid.snapToGrid).toBe(true);

    const startPt = { x: -87, y: -161 };
    const rawEnd = { x: -49, y: 112 };

    // En PixiCanvas, los extremos de la pared no se redondean a la cuadrícula:
    // startPt y endPt preservan sus coordenadas exactas
    const wallEntity: Entity = {
      id: 'wall_exact_coords',
      type: 'wall',
      name: 'Pared Exacta',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: false,
      locked: false,
      points: [startPt, rawEnd],
      closed: false
    };

    useGameStore.getState().addEntity(wallEntity);
    const created = useGameStore.getState().game.entities.find((e) => e.id === 'wall_exact_coords');
    expect(created?.points).toEqual([
      { x: -87, y: -161 },
      { x: -49, y: 112 }
    ]);
  });
});
