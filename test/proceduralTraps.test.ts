import { describe, it, expect } from 'vitest';
import { Entity, EffectConfig, EffectPresetId } from '../src/types/entity';

describe('Trampas procedurales (Bloque 3)', () => {
  it('crea correctamente la configuración para péndulo con cuchilla', () => {
    const bladePendulum: Entity = {
      id: 'effect_trap_1',
      type: 'effect',
      name: 'Péndulo con cuchilla',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'blade_pendulum',
        category: 'traps',
        color: '#94a3b8',
        intensity: 80,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        trapLength: 2,
        trapAngle: 45
      }
    };

    expect(bladePendulum.effect?.preset).toBe('blade_pendulum');
    expect(bladePendulum.effect?.category).toBe('traps');
    expect(bladePendulum.effect?.trapLength).toBe(2);
    expect(bladePendulum.effect?.trapAngle).toBe(45);
  });

  it('crea correctamente la configuración para sierra giratoria con carril', () => {
    const sawBlade: Entity = {
      id: 'effect_trap_2',
      type: 'effect',
      name: 'Sierra giratoria',
      x: 350,
      y: 350,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'saw_blade',
        category: 'traps',
        color: '#64748b',
        intensity: 80,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        hasRail: true,
        trapLength: 4
      }
    };

    expect(sawBlade.effect?.preset).toBe('saw_blade');
    expect(sawBlade.effect?.hasRail).toBe(true);
    expect(sawBlade.effect?.trapLength).toBe(4);
  });

  it('crea correctamente la configuración para trampa de pinchos con sangre', () => {
    const spikeTrap: Entity = {
      id: 'effect_trap_3',
      type: 'effect',
      name: 'Trampa de pinchos',
      x: 500,
      y: 500,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 25,
      visibleToPlayers: true,
      locked: false,
      effect: {
        preset: 'spike_trap',
        category: 'traps',
        color: '#94a3b8',
        intensity: 80,
        speed: 1.0,
        emitsLight: false,
        baseLightRadius: 0,
        hasBlood: true
      }
    };

    expect(spikeTrap.effect?.preset).toBe('spike_trap');
    expect(spikeTrap.effect?.hasBlood).toBe(true);
  });
});
