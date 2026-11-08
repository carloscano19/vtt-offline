import { describe, it, expect } from 'vitest';
import { findEntityAtPosition } from '../src/pixi/utils/hitTesting';
import { Entity } from '../src/types/entity';

describe('Bloque 1: Entidades bloqueadas seleccionables y prioridad al hacer clic', () => {
  it('selecciona una entidad bloqueada si es la única entidad en ese punto', () => {
    const lockedTrap: Entity = {
      id: 'trap_1',
      type: 'effect',
      name: 'Trampa bloqueada',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: true,
      visibleToPlayers: true
    };

    const result = findEntityAtPosition([lockedTrap], { x: 105, y: 105 }, 1.0);
    expect(result).toBeDefined();
    expect(result?.id).toBe('trap_1');
    expect(result?.locked).toBe(true);
  });

  it('no roba el clic: un token no bloqueado tiene prioridad sobre un efecto grande bloqueado que esté debajo', () => {
    const largeLockedFog: Entity = {
      id: 'large_fog',
      type: 'effect',
      name: 'Niebla de área bloqueada',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 4, // Radio efectivo mayor a 140px
      scaleY: 4,
      locked: true,
      visibleToPlayers: true,
      zIndex: 10
    };

    const normalToken: Entity = {
      id: 'player_token',
      type: 'token',
      name: 'Guerrero',
      x: 210,
      y: 210,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: false,
      visibleToPlayers: true,
      zIndex: 30
    };

    // Al hacer clic en la posición donde coinciden ambos, debe seleccionarse el token no bloqueado
    const clickedBoth = findEntityAtPosition([largeLockedFog, normalToken], { x: 212, y: 212 }, 1.0);
    expect(clickedBoth).toBeDefined();
    expect(clickedBoth?.id).toBe('player_token');
    expect(clickedBoth?.locked).toBe(false);

    // Al hacer clic fuera del token pero dentro de la niebla, se selecciona la niebla bloqueada
    const clickedOnlyFog = findEntityAtPosition([largeLockedFog, normalToken], { x: 280, y: 280 }, 1.0);
    expect(clickedOnlyFog).toBeDefined();
    expect(clickedOnlyFog?.id).toBe('large_fog');
    expect(clickedOnlyFog?.locked).toBe(true);
  });

  it('excepción de mapas: un mapa bloqueado no se selecciona con clics en el suelo', () => {
    const lockedMap: Entity = {
      id: 'dungeon_map',
      type: 'map',
      name: 'Mazmorra',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: true,
      visibleToPlayers: true,
      mapData: {
        gridWidth: 20,
        gridHeight: 20,
        pixelsPerGrid: 70
      }
    };

    // Clic en el suelo del mapa bloqueado no debe seleccionarlo
    const result = findEntityAtPosition([lockedMap], { x: 350, y: 350 }, 1.0);
    expect(result).toBeUndefined();
  });

  it('un mapa desbloqueado sí se selecciona al hacer clic', () => {
    const unlockedMap: Entity = {
      id: 'dungeon_map_unlocked',
      type: 'map',
      name: 'Mazmorra Libre',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      locked: false,
      visibleToPlayers: true,
      mapData: {
        gridWidth: 20,
        gridHeight: 20,
        pixelsPerGrid: 70
      }
    };

    const result = findEntityAtPosition([unlockedMap], { x: 350, y: 350 }, 1.0);
    expect(result).toBeDefined();
    expect(result?.id).toBe('dungeon_map_unlocked');
  });
});
