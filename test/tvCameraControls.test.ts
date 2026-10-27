import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { normalizeGameState } from '../src/modules/persistence/normalizer';
import { fitMapInViewport, isPlayerCameraOutOfBounds, getMapBoundingBox } from '../src/modules/camera/cameraUtils';
import { Entity } from '../src/types/entity';
import { GameState } from '../src/types/game';

describe('TV Camera Controls & Viewport Fitting', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  const sampleMap: Entity = {
    id: 'map_1',
    type: 'map',
    name: 'Dungeon',
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 0,
    visibleToPlayers: true,
    locked: false,
    mapData: {
      pixelsPerGrid: 256,
      gridWidth: 20, // 20 * 256 = 5120
      gridHeight: 15, // 15 * 256 = 3840
      walls: [],
      portals: [],
      lights: []
    }
  };

  it('calculates bounding box correctly for maps', () => {
    const bbox = getMapBoundingBox([sampleMap]);
    expect(bbox).not.toBeNull();
    expect(bbox?.width).toBe(5120);
    expect(bbox?.height).toBe(3840);
    expect(bbox?.centerX).toBe(2560);
    expect(bbox?.centerY).toBe(1920);
  });

  it('fits map in TV viewport properly', () => {
    const viewport = { width: 1920, height: 1080 };
    const fitted = fitMapInViewport([sampleMap], viewport);
    expect(fitted).not.toBeNull();
    if (!fitted) return;

    // Zoom should scale to fit height or width with paddingFactor (0.95)
    // 1920 / 5120 = 0.375; 1080 / 3840 = 0.28125 -> height is tighter.
    // 0.28125 * 0.95 = ~0.267
    expect(fitted.zoom).toBeCloseTo(0.267, 2);
    // Camera center should align with world map center (2560, 1920)
    expect(fitted.x).toBe(2560);
    expect(fitted.y).toBe(1920);
  });

  it('detects when playerCamera is out of bounds or has absurd zoom', () => {
    // Normal camera
    const normalCam = { x: 2560, y: 1920, zoom: 0.5 };
    expect(isPlayerCameraOutOfBounds(normalCam, [sampleMap])).toBe(false);

    // Absurd zoom too small
    const tinyZoom = { x: 2560, y: 1920, zoom: 0.04 };
    expect(isPlayerCameraOutOfBounds(tinyZoom, [sampleMap])).toBe(true);

    // Absurd zoom too large
    const hugeZoom = { x: 2560, y: 1920, zoom: 4.0 };
    expect(isPlayerCameraOutOfBounds(hugeZoom, [sampleMap])).toBe(true);

    // Camera placed lightyears away from map
    const farCam = { x: -50000, y: -50000, zoom: 0.5 };
    expect(isPlayerCameraOutOfBounds(farCam, [sampleMap])).toBe(true);
  });

  it('normalizer auto-fits player camera if it is out of bounds on save load', () => {
    const corruptedGame: GameState = {
      ...useGameStore.getState().game,
      entities: [sampleMap],
      playerCamera: { x: -99999, y: -99999, zoom: 0.01 }
    };

    const normalized = normalizeGameState(corruptedGame);
    expect(isPlayerCameraOutOfBounds(normalized.playerCamera, normalized.entities)).toBe(false);
    expect(normalized.playerCamera.zoom).toBeGreaterThan(0.06);
    expect(normalized.playerCamera.zoom).toBeLessThan(3.5);
  });

  it('rescales master and player camera zoom inversely when grid.size changes', () => {
    const store = useGameStore.getState();
    store.setPlayerCamera({ x: 100, y: 100, zoom: 1.0 });
    store.setMasterCamera({ x: 200, y: 200, zoom: 1.0 });

    // Current grid size is 70. Change grid size to 140 (double size -> entities double in size)
    // Zoom must halve (0.5) so visible screen representation remains unchanged
    store.setGridConfig({ size: 140 });

    const updated = useGameStore.getState().game;
    expect(updated.grid.size).toBe(140);
    expect(updated.playerCamera.zoom).toBeCloseTo(0.5, 3);
    expect(updated.masterCamera.zoom).toBeCloseTo(0.5, 3);
  });
});
