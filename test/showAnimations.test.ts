import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { ShowAnimationController } from '../src/pixi/utils/showAnimation';
import { videoManager } from '../src/modules/media/videoManager';
import { normalizeEntity } from '../src/modules/persistence/normalizer';
import { Entity } from '../src/types/entity';

describe('Bloque 4: Animar al mostrar y Reproducir una vez', () => {
  it('ShowAnimationController maneja la animación pop (brotar)', () => {
    const ctrl = new ShowAnimationController();
    const container = new Container();

    ctrl.trigger('ent-1', 'pop', container, 70);
    expect(ctrl.has('ent-1')).toBe(true);

    const initial = ctrl.getTransform('ent-1');
    expect(initial).not.toBeNull();
    expect(initial?.scaleXMult).toBe(0);
    expect(initial?.scaleYMult).toBe(0);

    // Avanzar mitad de duración (0.25s de 0.5s)
    ctrl.tick(0.25);
    const mid = ctrl.getTransform('ent-1');
    expect(mid?.scaleXMult).toBeGreaterThan(0.5);

    // Finalizar animación
    ctrl.tick(0.3);
    expect(ctrl.has('ent-1')).toBe(false);
  });

  it('ShowAnimationController maneja la animación fall (caer desde 250px)', () => {
    const ctrl = new ShowAnimationController();
    const container = new Container();

    ctrl.trigger('ent-fall', 'fall', container, 70);
    expect(ctrl.has('ent-fall')).toBe(true);

    const initial = ctrl.getTransform('ent-fall');
    expect(initial?.yOffset).toBe(-250);

    // A los 0.2s, debe haber caído sustancialmente
    ctrl.tick(0.2);
    const falling = ctrl.getTransform('ent-fall');
    expect(falling?.yOffset).toBeGreaterThan(-250);
    expect(falling?.yOffset).toBeLessThan(0);

    // Finalizar animación
    ctrl.tick(0.4);
    expect(ctrl.has('ent-fall')).toBe(false);
  });

  it('ShowAnimationController maneja la animación flash', () => {
    const ctrl = new ShowAnimationController();
    const container = new Container();

    ctrl.trigger('ent-flash', 'flash', container, 70);
    expect(ctrl.has('ent-flash')).toBe(true);

    ctrl.tick(0.1);
    const mid = ctrl.getTransform('ent-flash');
    expect(mid?.alphaMult).toBeGreaterThan(0);

    ctrl.tick(0.5);
    expect(ctrl.has('ent-flash')).toBe(false);
  });

  it('videoManager.restartAndPlayOnce ejecuta el callback cuando termina o tras timeout', async () => {
    vi.useFakeTimers();
    let endedCalled = false;

    videoManager.restartAndPlayOnce('non-existent-asset', () => {
      endedCalled = true;
    });

    vi.advanceTimersByTime(3000);
    expect(endedCalled).toBe(true);
    vi.useRealTimers();
  });

  it('Normalizador preserva showAnimation válido y playOnceOnShow', () => {
    const base: Entity = {
      id: 'token-1',
      type: 'token',
      name: 'Goblin',
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      visibleToPlayers: true,
      locked: false,
      showAnimation: 'pop',
      playOnceOnShow: true
    };

    const norm = normalizeEntity(base);
    expect(norm.showAnimation).toBe('pop');
    expect(norm.playOnceOnShow).toBe(true);

    const invalid = normalizeEntity({ ...base, showAnimation: 'invalid_anim' as any });
    expect(invalid.showAnimation).toBeUndefined();
  });
});
