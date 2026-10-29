import { describe, it, expect } from 'vitest';
import { generateConeSectorPolygon } from '../src/modules/vision/visibilityPolygon';
import { visionManager } from '../src/modules/vision/visionManager';
import { lightManager } from '../src/modules/lights/lightManager';
import { Entity } from '../src/types/entity';

describe('Directional Cone Vision and Lighting', () => {
  it('generates a closed sector polygon within specified angle range', () => {
    const center = { x: 0, y: 0 };
    const rangePx = 200;
    const rotationRad = 0; // Apunta hacia +X
    const coneAngleDeg = 60; // [-30 deg, +30 deg]
    const directionOffsetDeg = 0;

    const sector = generateConeSectorPolygon(center, rangePx, rotationRad, coneAngleDeg, directionOffsetDeg);

    expect(sector.length).toBeGreaterThan(5);
    // Primer vértice debe ser el ápice (centro)
    expect(sector[0].x).toBeCloseTo(0, 1);
    expect(sector[0].y).toBeCloseTo(0, 1);

    // Todos los puntos no centrales deben estar en el rango de ángulos [-30°, +30°]
    const halfAngleRad = (30 * Math.PI) / 180;
    for (let i = 1; i < sector.length; i++) {
      const pt = sector[i];
      const dist = Math.hypot(pt.x, pt.y);
      expect(dist).toBeLessThanOrEqual(rangePx + 1);

      const angle = Math.atan2(pt.y, pt.x);
      expect(angle).toBeGreaterThanOrEqual(-halfAngleRad - 0.05);
      expect(angle).toBeLessThanOrEqual(halfAngleRad + 0.05);
    }
  });

  it('clips token cone vision polygon within angular sector and against a wall', () => {
    const token: Entity = {
      id: 'token_scout',
      type: 'token',
      name: 'Explorador',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: true,
      locked: false,
      side: 'jugador',
      vision: {
        active: true,
        brightRangeInSquares: 4,
        dimRangeInSquares: 2,
        hardness: 0.5,
        shape: 'cone',
        coneAngle: 60,
        directionOffset: 0
      }
    };

    // Pared a 100px a la derecha, bloqueando x > 100
    const wall: Entity = {
      id: 'wall_1',
      type: 'wall',
      name: 'Muro',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 30,
      visibleToPlayers: false,
      locked: true,
      points: [
        { x: 100, y: -200 },
        { x: 100, y: 200 }
      ]
    };

    const gridSize = 70;
    const visibilities = visionManager.getTokensVisibility([token, wall], gridSize);
    expect(visibilities.length).toBe(1);

    const vis = visibilities[0];
    expect(vis.shape).toBe('cone');
    expect(vis.coneAngle).toBe(60);
    expect(vis.totalPolygon.length).toBeGreaterThan(3);

    const halfAngleRad = (30 * Math.PI) / 180;
    const tokenSizePx = Math.max(0.2, Math.abs(token.scaleX || 1)) * gridSize;
    const selfRadiusPx = tokenSizePx / 2 + 0.25 * gridSize; // 52.5px

    // Debe incluir un círculo de visión alrededor del propio token para que se vea a sí mismo
    const minX = Math.min(...vis.totalPolygon.map((p) => p.x));
    expect(minX).toBeLessThan(-30);
    expect(minX).toBeGreaterThanOrEqual(-selfRadiusPx - 1);

    for (const pt of vis.totalPolygon) {
      const dist = Math.hypot(pt.x, pt.y);
      // Cualquier punto más allá del radio propio debe encontrarse dentro del cono de 60°
      if (dist > selfRadiusPx + 1) {
        const angle = Math.atan2(pt.y, pt.x);
        expect(angle).toBeGreaterThanOrEqual(-halfAngleRad - 0.05);
        expect(angle).toBeLessThanOrEqual(halfAngleRad + 0.05);
      } else {
        // Dentro del radio propio, no excede selfRadiusPx
        expect(dist).toBeLessThanOrEqual(selfRadiusPx + 1);
      }
    }

    // La pared a x = 100 debe recortar el avance del cono hacia la derecha
    const maxX = Math.max(...vis.totalPolygon.map((p) => p.x));
    expect(maxX).toBeCloseTo(100, 1);
    for (const p of vis.totalPolygon) {
      expect(p.x).toBeLessThanOrEqual(100.5);
    }
  });

  it('clips token self-circle vision against a wall behind the token', () => {
    const token: Entity = {
      id: 'token_scout_2',
      type: 'token',
      name: 'Explorador Con Pared Atras',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: true,
      locked: false,
      side: 'jugador',
      vision: {
        active: true,
        brightRangeInSquares: 4,
        dimRangeInSquares: 2,
        hardness: 0.5,
        shape: 'cone',
        coneAngle: 60,
        directionOffset: 0
      }
    };

    // Pared detrás del token a x = -20 (el radio propio normal sería 52.5px)
    const backWall: Entity = {
      id: 'back_wall',
      type: 'wall',
      name: 'Muro Atras',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 30,
      visibleToPlayers: false,
      locked: true,
      points: [
        { x: -20, y: -200 },
        { x: -20, y: 200 }
      ]
    };

    const gridSize = 70;
    const visibilities = visionManager.getTokensVisibility([token, backWall], gridSize);
    expect(visibilities.length).toBe(1);

    const vis = visibilities[0];
    const minX = Math.min(...vis.totalPolygon.map((p) => p.x));
    // El círculo propio debe quedar recortado por la pared a x = -20
    expect(minX).toBeCloseTo(-20, 1);
    for (const p of vis.totalPolygon) {
      expect(p.x).toBeGreaterThanOrEqual(-20.5);
    }
  });

  it('clips light cone polygon within angular sector and against a wall', () => {
    const light: Entity = {
      id: 'light_lantern',
      type: 'light',
      name: 'Linterna',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 45,
      visibleToPlayers: true,
      locked: false,
      light: {
        color: '#ffaa00',
        intensity: 80,
        brightRadiusInSquares: 3,
        dimRadiusInSquares: 2,
        edgeHardness: 0.5,
        flicker: false,
        shape: 'cone',
        coneAngle: 90,
        directionOffset: 0
      }
    };

    // Pared a 80px a la derecha
    const wall: Entity = {
      id: 'wall_2',
      type: 'wall',
      name: 'Muro',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 30,
      visibleToPlayers: false,
      locked: true,
      points: [
        { x: 80, y: -200 },
        { x: 80, y: 200 }
      ]
    };

    const gridSize = 70;
    const lights = lightManager.getLightsVisibility([light, wall], gridSize);
    expect(lights.length).toBe(1);

    const lvis = lights[0];
    expect(lvis.shape).toBe('cone');
    expect(lvis.coneAngle).toBe(90);
    expect(lvis.totalPolygon.length).toBeGreaterThan(3);

    const halfAngleRad = (45 * Math.PI) / 180;
    for (const pt of lvis.totalPolygon) {
      const dist = Math.hypot(pt.x, pt.y);
      if (dist > 1) {
        const angle = Math.atan2(pt.y, pt.x);
        expect(angle).toBeGreaterThanOrEqual(-halfAngleRad - 0.05);
        expect(angle).toBeLessThanOrEqual(halfAngleRad + 0.05);
      }
    }

    // La pared a x = 80 debe recortar la luz hacia la derecha
    const maxX = Math.max(...lvis.totalPolygon.map((p) => p.x));
    expect(maxX).toBeCloseTo(80, 1);
    for (const p of lvis.totalPolygon) {
      expect(p.x).toBeLessThanOrEqual(80.5);
    }
  });

  it('rotates cone direction according to entity rotation and directionOffset', () => {
    const center = { x: 50, y: 50 };
    const rangePx = 150;
    // Rotación 90° (apunta hacia abajo +Y) + offset 45° = 135°
    const rotationRad = Math.PI / 2;
    const directionOffsetDeg = 45;
    const coneAngleDeg = 40; // [115°, 155°]

    const sector = generateConeSectorPolygon(center, rangePx, rotationRad, coneAngleDeg, directionOffsetDeg);
    expect(sector.length).toBeGreaterThan(5);

    const minAngleRad = ((135 - 20) * Math.PI) / 180;
    const maxAngleRad = ((135 + 20) * Math.PI) / 180;

    for (let i = 1; i < sector.length; i++) {
      const dx = sector[i].x - center.x;
      const dy = sector[i].y - center.y;
      const angle = Math.atan2(dy, dx);
      expect(angle).toBeGreaterThanOrEqual(minAngleRad - 0.05);
      expect(angle).toBeLessThanOrEqual(maxAngleRad + 0.05);
    }
  });
});
