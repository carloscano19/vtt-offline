import { describe, it, expect, vi } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { normalizeGameState } from '../src/modules/persistence/normalizer';
import { AmbientLayer } from '../src/pixi/layers/AmbientLayer';
import { syncChannel } from '../src/modules/sync/syncChannel';

describe('Global ambient light (Luz global)', () => {
  it('new games start in dusk (Atardecer) with 60% darkness and color #c84224', () => {
    const initialStoreState = useGameStore.getState().game;
    expect(initialStoreState.ambient.preset).toBe('dusk');
    expect(initialStoreState.ambient.color).toBe('#c84224');
    expect(initialStoreState.ambient.intensity).toBe(60);
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
    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.60, 2);

    // Update with custom color and intensity
    layer.update({ preset: 'custom', color: '#ff4400', intensity: 60 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.60, 2);

    // Update with noon (0% darkness)
    layer.update({ preset: 'noon', color: '#ffffff', intensity: 0 }, [], bounds, 2.0);
    expect((layer as any).targetDarkness).toBeCloseTo(0.0, 2);
  });

  it('AmbientLayer clears ambient darkness in token vision area when illuminates is true', () => {
    const layer = new AmbientLayer(true);
    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };

    const tokenVis: any = {
      tokenId: 'token_1',
      center: { x: 500, y: 500 },
      brightRangePx: 280,
      totalRangePx: 420,
      illuminates: true,
      shape: 'circle',
      totalPolygon: [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
        { x: 600, y: 600 },
        { x: 400, y: 600 }
      ]
    };

    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [], bounds, 0.016, [tokenVis]);
    const cached = (layer as any).cachedRegions;
    expect(cached).toBeDefined();
    // totalMulti debe contener la región iluminada por el token
    expect(cached.totalMulti.length).toBeGreaterThan(0);
  });

  it('AmbientLayer does not clear darkness when token vision illuminates is false', () => {
    const layer = new AmbientLayer(true);
    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };

    const tokenVis: any = {
      tokenId: 'token_1',
      center: { x: 500, y: 500 },
      brightRangePx: 280,
      totalRangePx: 420,
      illuminates: false,
      shape: 'circle',
      totalPolygon: [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
        { x: 600, y: 600 },
        { x: 400, y: 600 }
      ]
    };

    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [], bounds, 0.016, [tokenVis]);
    const cached = (layer as any).cachedRegions;
    expect(cached).toBeDefined();
    expect(cached.totalMulti.length).toBe(0);
  });

  it('White light produces practically invisible tint while orange #ff9a3c produces a warm soft tint', () => {
    const layer = new AmbientLayer(true);
    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };

    const whiteLight: any = {
      lightId: 'light_white',
      center: { x: 200, y: 200 },
      color: '#ffffff',
      intensity: 0.8,
      brightRangePx: 200,
      totalRangePx: 300,
      flicker: false,
      shape: 'circle',
      totalPolygon: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 }
      ]
    };

    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [whiteLight], bounds, 0.016);
    const whiteSprite = (layer as any).tintDimSprites[0];
    expect(whiteSprite).toBeDefined();
    // Con luz blanca, baseAlpha debe ser 0 para no lavar el mapa con una capa blanquecina
    expect(whiteSprite.alpha).toBeCloseTo(0, 3);
    expect(whiteSprite.visible).toBe(false);

    const orangeLight: any = {
      lightId: 'light_orange',
      center: { x: 500, y: 500 },
      color: '#ff9a3c',
      intensity: 0.8,
      brightRangePx: 200,
      totalRangePx: 300,
      flicker: false,
      shape: 'circle',
      totalPolygon: [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
        { x: 600, y: 600 },
        { x: 400, y: 600 }
      ]
    };

    layer.update({ preset: 'dusk', color: '#c84224', intensity: 60 }, [orangeLight], bounds, 0.016);
    const orangeSprite = (layer as any).tintDimSprites[0];
    expect(orangeSprite).toBeDefined();
    // Con luz naranja, tiene un tinte suave de baja intensidad (< 0.10)
    expect(orangeSprite.alpha).toBeGreaterThan(0.01);
    expect(orangeSprite.alpha).toBeLessThan(0.12);
    expect(orangeSprite.visible).toBe(true);
  });
});
