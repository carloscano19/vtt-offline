import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  filterStateForRemote,
  compressString,
  decompressString
} from '../src/modules/online/onlineRoomManager';
import { GameState } from '../src/types/game';
import { Entity } from '../src/types/entity';

describe('Bloque 1: Online Room - Codes, Filtering and Compression', () => {
  it('generates a cryptographically random room code with at least 16 characters', () => {
    const code1 = generateRoomCode();
    const code2 = generateRoomCode();

    expect(code1.length).toBeGreaterThanOrEqual(16);
    expect(code2.length).toBeGreaterThanOrEqual(16);
    expect(code1).not.toBe(code2);
    expect(/^[a-z0-9]+$/.test(code1)).toBe(true);
  });

  it('filters out hidden entities, masks locked doors, and strips master-only state', () => {
    const visibleToken: Entity = {
      id: 'token_hero',
      type: 'token',
      name: 'Hero',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [
        { type: 'Bendecido', turnsRemaining: 3, visibleToPlayers: true },
        { type: 'Hechizado', turnsRemaining: 2, visibleToPlayers: false } // Hidden status
      ]
    };

    const hiddenToken: Entity = {
      id: 'token_stealth_goblin',
      type: 'token',
      name: 'Goblin Oculto',
      x: 150,
      y: 150,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: false, // HIDDEN
      locked: false
    };

    const lockedDoor: Entity = {
      id: 'door_dungeon',
      type: 'door',
      name: 'Puerta con Llave',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 20,
      visibleToPlayers: true,
      locked: false,
      door: {
        isOpen: false,
        isLocked: true, // Should be masked to false
        length: 70,
        isHingeInverted: false,
        p1: { x: 200, y: 200 },
        p2: { x: 270, y: 200 }
      }
    };

    const wall: Entity = {
      id: 'wall_1',
      type: 'wall',
      name: 'Pared',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 30,
      visibleToPlayers: true,
      locked: false,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    };

    const rawGame: GameState = {
      entities: [visibleToken, hiddenToken, lockedDoor, wall],
      masterCamera: { x: 999, y: 888, zoom: 2.5 },
      playerCamera: { x: 100, y: 100, zoom: 1.0 },
      playerViewport: { width: 1920, height: 1080 },
      grid: { size: 70, snapToGrid: true, color: '#ffffff', opacity: 0.2, wallsBlockMovement: true },
      fog: { explored: [], revealed: [] },
      ambient: { preset: 'bright', overlayOpacity: 0, darkness: 0 },
      weather: { rain: { enabled: false, intensity: 0, direction: 0 }, snow: { enabled: false, intensity: 0, direction: 0 } },
      music: { isPlaying: false, currentTrackId: null, volume: 0.8, playlist: [] },
      ruler: { measuring: false, startPos: null, currentPos: null, mode: 'ray', diagonalRule: '5e', visibleToPlayers: true }
    };

    const filtered = filterStateForRemote(rawGame);

    // Hidden goblin must be completely gone
    expect(filtered.entities.some((e) => e.id === 'token_stealth_goblin')).toBe(false);

    // Visible hero and wall must remain
    expect(filtered.entities.some((e) => e.id === 'token_hero')).toBe(true);
    expect(filtered.entities.some((e) => e.id === 'wall_1')).toBe(true);

    // Hero statuses: secret status must be removed
    const filteredHero = filtered.entities.find((e) => e.id === 'token_hero');
    expect(filteredHero?.statuses).toEqual([
      { type: 'Bendecido', turnsRemaining: 3, visibleToPlayers: true }
    ]);

    // Locked door must have isLocked set to false
    const filteredDoor = filtered.entities.find((e) => e.id === 'door_dungeon');
    expect(filteredDoor?.door?.isLocked).toBe(false);
    expect(filteredDoor?.door?.isOpen).toBe(false);

    // Master camera must not leak
    expect(filtered.masterCamera).toEqual(filtered.playerCamera);
  });

  it('compresses and decompresses large game states without loss', async () => {
    const largeObject: Record<string, any> = {
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `entry_${i}`,
        description: `This is a long repetitive string for testing gzip compression on large VTT board states with coordinates and metadata ${i}`
      }))
    };
    const jsonStr = JSON.stringify(largeObject);
    expect(jsonStr.length).toBeGreaterThan(50000);

    const compressed = await compressString(jsonStr);
    expect(compressed.length).toBeLessThan(jsonStr.length);

    const decompressed = await decompressString(compressed);
    expect(decompressed).toBe(jsonStr);
    expect(JSON.parse(decompressed)).toEqual(largeObject);
  });
});
