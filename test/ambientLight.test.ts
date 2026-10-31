import { describe, it, expect, vi } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { normalizeGameState } from '../src/modules/persistence/normalizer';
import { AmbientLayer } from '../src/pixi/layers/AmbientLayer';
import { syncChannel } from '../src/modules/sync/syncChannel';

describe('Global ambient light (Luz global)', () => {
  it('new games start in dusk (Atardecer) with 35% darkness and color #c84224', () => {
    const initialStoreState = useGameStore.getState().game;
    expect(initialStoreState.ambient.preset).toBe('dusk');
    expect(initialStoreState.ambient.color).toBe('#c84224');
    expect(initialStoreState.ambient.intensity).toBe(35);
  });

  it('normalizer does not change ambient preset of existing games', () => {
    const existingGame: any = {
      id: 'existing_1',
      name: 'Partida Antigua',
      version: 1,
      turnCounter: 0,
      updatedAt: Date.now(),
      entities: [],
      masterCamera: { x: 0, y: 0, zoom: 1 },
      playerCamera: { x: 0, y: 0, zoom: 1 },
      fog: { enabled: true, rememberExplored: false, explored: [], revealed: [] },
      ambient: {
        preset: 'noon',
        color: '#ffffff',
        intensity: 1.0
      }
    };

    const normalized = normalizeGameState(existingGame);
    expect(normalized.ambient.preset).toBe('noon');
  });

  it('setAmbientConfig immediately notifies syncChannel and updates store', () => {
    const sendStateSpy = vi.spyOn(syncChannel, 'sendState');

    useGameStore.getState().setAmbientConfig({
      preset: 'night',
      color: '#091124',
      intensity: 85
    });

    expect(useGameStore.getState().game.ambient.preset).toBe('night');
    expect(useGameStore.getState().game.ambient.color).toBe('#091124');
    expect(useGameStore.getState().game.ambient.intensity).toBe(85);
    expect(sendStateSpy).toHaveBeenCalled();
  });

  it('AmbientLayer correctly processes presets and custom tint / intensity', () => {
    const layer = new AmbientLayer(true);
    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };

    // Update with dusk
    layer.update({ preset: 'dusk', color: '#c84224', intensity: 35 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.35, 2);

    // Update with custom color and intensity
    layer.update({ preset: 'custom', color: '#ff4400', intensity: 60 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.60, 2);

    // Update with noon (0% darkness)
    layer.update({ preset: 'noon', color: '#ffffff', intensity: 0 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.0, 2);
  });
});
