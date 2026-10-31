import { describe, it, expect } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { Entity } from '../src/types/entity';

describe('Volteo espejo (Horizontal & Vertical Flip)', () => {
  it('flipEntitiesHorizontal inverts scaleX for tokens, objects, effects, and maps, but not walls', () => {
    const token: Entity = {
      id: 'token_flip_1',
      type: 'token',
      name: 'Hero',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      zIndex: 10
    };

    const map: Entity = {
      id: 'map_flip_1',
      type: 'map',
      name: 'Dungeon',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 0
    };

    const wall: Entity = {
      id: 'wall_flip_1',
      type: 'wall',
      name: 'Wall',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 5,
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
    };

    useGameStore.setState({
      game: {
        ...useGameStore.getState().game,
        entities: [token, map, wall]
      },
      past: [],
      future: []
    });

    useGameStore.getState().flipEntitiesHorizontal(['token_flip_1', 'map_flip_1', 'wall_flip_1']);

    const entitiesAfterH = useGameStore.getState().game.entities;
    const flippedToken = entitiesAfterH.find((e) => e.id === 'token_flip_1');
    const flippedMap = entitiesAfterH.find((e) => e.id === 'map_flip_1');
    const unchangedWall = entitiesAfterH.find((e) => e.id === 'wall_flip_1');

    expect(flippedToken?.scaleX).toBe(-1.5);
    expect(flippedToken?.scaleY).toBe(1.5);

    expect(flippedMap?.scaleX).toBe(-1);
    expect(flippedMap?.scaleY).toBe(1);

    expect(unchangedWall?.scaleX).toBe(1);

    // Flip again returns to positive
    useGameStore.getState().flipEntitiesHorizontal(['token_flip_1']);
    expect(useGameStore.getState().game.entities.find((e) => e.id === 'token_flip_1')?.scaleX).toBe(1.5);
  });

  it('flipEntitiesVertical inverts scaleY for tokens and effects', () => {
    const effect: Entity = {
      id: 'effect_flip_1',
      type: 'effect',
      name: 'Torch',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 2,
      scaleY: 2,
      zIndex: 10
    };

    useGameStore.setState({
      game: {
        ...useGameStore.getState().game,
        entities: [effect]
      },
      past: [],
      future: []
    });

    useGameStore.getState().flipEntitiesVertical(['effect_flip_1']);
    const flippedEffect = useGameStore.getState().game.entities.find((e) => e.id === 'effect_flip_1');

    expect(flippedEffect?.scaleX).toBe(2);
    expect(flippedEffect?.scaleY).toBe(-2);
  });

  it('supports undoing a flip operation', () => {
    const token: Entity = {
      id: 'token_undo_1',
      type: 'token',
      name: 'Mage',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 1
    };

    useGameStore.setState({
      game: {
        ...useGameStore.getState().game,
        entities: [token]
      },
      past: [],
      future: []
    });

    useGameStore.getState().flipEntitiesHorizontal(['token_undo_1']);
    expect(useGameStore.getState().game.entities.find((e) => e.id === 'token_undo_1')?.scaleX).toBe(-1);

    useGameStore.getState().undo();
    expect(useGameStore.getState().game.entities.find((e) => e.id === 'token_undo_1')?.scaleX).toBe(1);
  });
});
