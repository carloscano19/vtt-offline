import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { Entity } from '../src/types/entity';
import { normalizeGameState } from '../src/modules/persistence/normalizer';

describe('Bloque 1: Tokens nuevos sin visión y bando neutral por defecto', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('un token nuevo nace con bando neutral y vision.active = false', () => {
    const newToken: Entity = {
      id: 'token_goblin',
      type: 'token',
      name: 'Goblin',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: false,
      locked: false,
      side: 'neutral',
      vision: {
        active: false,
        brightRangeInSquares: 6,
        dimRangeInSquares: 2,
        hardness: 0.5,
        illuminates: true
      }
    };

    useGameStore.getState().addEntity(newToken);
    const added = useGameStore.getState().game.entities.find((e) => e.id === 'token_goblin');
    expect(added).toBeDefined();
    expect(added?.side).toBe('neutral');
    expect(added?.vision?.active).toBe(false);
    expect(added?.vision?.brightRangeInSquares).toBe(6);
    expect(added?.vision?.dimRangeInSquares).toBe(2);
    expect(added?.vision?.illuminates).toBe(true);
  });

  it('al cambiar a jugador se activa su visión con los valores por defecto (6+2, ilumina)', () => {
    const neutralToken: Entity = {
      id: 'token_npc',
      type: 'token',
      name: 'Aldeano',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: false,
      locked: false,
      side: 'neutral',
      vision: {
        active: false,
        brightRangeInSquares: 6,
        dimRangeInSquares: 2,
        hardness: 0.5,
        illuminates: true
      }
    };
    useGameStore.getState().addEntity(neutralToken);

    // Cambiar a jugador
    useGameStore.getState().updateEntity('token_npc', { side: 'jugador' });
    const playerToken = useGameStore.getState().game.entities.find((e) => e.id === 'token_npc');
    expect(playerToken?.side).toBe('jugador');
    expect(playerToken?.vision?.active).toBe(true);
    expect(playerToken?.vision?.brightRangeInSquares).toBe(6);
    expect(playerToken?.vision?.dimRangeInSquares).toBe(2);
    expect(playerToken?.vision?.illuminates).toBe(true);
  });

  it('al cambiar a enemigo o neutral su visión se desactiva', () => {
    const playerToken: Entity = {
      id: 'token_hero',
      type: 'token',
      name: 'Mago',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      side: 'jugador',
      vision: {
        active: true,
        brightRangeInSquares: 6,
        dimRangeInSquares: 2,
        hardness: 0.5,
        illuminates: true
      }
    };
    useGameStore.getState().addEntity(playerToken);

    // Cambiar a enemigo
    useGameStore.getState().updateEntity('token_hero', { side: 'enemigo' });
    let token = useGameStore.getState().game.entities.find((e) => e.id === 'token_hero');
    expect(token?.side).toBe('enemigo');
    expect(token?.vision?.active).toBe(false);

    // Volver a cambiar a jugador -> se activa
    useGameStore.getState().updateEntity('token_hero', { side: 'jugador' });
    token = useGameStore.getState().game.entities.find((e) => e.id === 'token_hero');
    expect(token?.vision?.active).toBe(true);

    // Cambiar a neutral -> se desactiva
    useGameStore.getState().updateEntity('token_hero', { side: 'neutral' });
    token = useGameStore.getState().game.entities.find((e) => e.id === 'token_hero');
    expect(token?.side).toBe('neutral');
    expect(token?.vision?.active).toBe(false);
  });

  it('al duplicar, la copia conserva el bando y la visión del original', () => {
    // 1. Duplicar enemigo con visión inactiva
    const enemy: Entity = {
      id: 'token_orc',
      type: 'token',
      name: 'Orco',
      x: 70,
      y: 70,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: false,
      locked: false,
      side: 'enemigo',
      vision: {
        active: false,
        brightRangeInSquares: 6,
        dimRangeInSquares: 2,
        hardness: 0.5,
        illuminates: true
      }
    };
    useGameStore.getState().addEntity(enemy);
    const enemyCopyId = useGameStore.getState().duplicateEntity('token_orc');
    expect(enemyCopyId).toBeDefined();
    const enemyCopy = useGameStore.getState().game.entities.find((e) => e.id === enemyCopyId);
    expect(enemyCopy?.side).toBe('enemigo');
    expect(enemyCopy?.vision?.active).toBe(false);

    // 2. Duplicar jugador con visión activa
    const hero: Entity = {
      id: 'token_cleric',
      type: 'token',
      name: 'Clérigo',
      x: 140,
      y: 140,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      side: 'jugador',
      vision: {
        active: true,
        brightRangeInSquares: 8,
        dimRangeInSquares: 3,
        hardness: 0.5,
        illuminates: true
      }
    };
    useGameStore.getState().addEntity(hero);
    const heroCopyId = useGameStore.getState().duplicateEntity('token_cleric');
    expect(heroCopyId).toBeDefined();
    const heroCopy = useGameStore.getState().game.entities.find((e) => e.id === heroCopyId);
    expect(heroCopy?.side).toBe('jugador');
    expect(heroCopy?.vision?.active).toBe(true);
    expect(heroCopy?.vision?.brightRangeInSquares).toBe(8);
    expect(heroCopy?.vision?.dimRangeInSquares).toBe(3);
  });

  it('no cambia los tokens de las partidas existentes al normalizar', () => {
    const existingGame = {
      id: 'existing_game',
      entities: [
        {
          id: 'existing_hero',
          type: 'token',
          name: 'Héroe Antiguo',
          side: 'jugador',
          vision: {
            active: true,
            brightRangeInSquares: 4,
            dimRangeInSquares: 2,
            hardness: 0.5
          }
        },
        {
          id: 'existing_boss',
          type: 'token',
          name: 'Jefe Antiguo',
          side: 'enemigo',
          vision: {
            active: false,
            brightRangeInSquares: 4,
            dimRangeInSquares: 2,
            hardness: 0.5
          }
        }
      ]
    };

    const normalized = normalizeGameState(existingGame as any);
    const hero = normalized.entities.find((e) => e.id === 'existing_hero')!;
    const boss = normalized.entities.find((e) => e.id === 'existing_boss')!;

    expect(hero.side).toBe('jugador');
    expect(hero.vision?.active).toBe(true);
    expect(hero.vision?.brightRangeInSquares).toBe(4);

    expect(boss.side).toBe('enemigo');
    expect(boss.vision?.active).toBe(false);
    expect(boss.vision?.brightRangeInSquares).toBe(4);
  });

  describe('Bloque 2: Anillo de bando opcional', () => {
    it('los tokens de bando neutral no muestran anillo por defecto; jugador y enemigo sí', () => {
      const neutralToken: Entity = {
        id: 'tok_neutral',
        type: 'token',
        name: 'Aldeano',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: false,
        locked: false,
        side: 'neutral'
      };
      const playerToken: Entity = {
        id: 'tok_player',
        type: 'token',
        name: 'Héroe',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false,
        side: 'jugador'
      };
      const enemyToken: Entity = {
        id: 'tok_enemy',
        type: 'token',
        name: 'Goblin',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: false,
        locked: false,
        side: 'enemigo'
      };

      const normNeutral = normalizeGameState({ id: 'g', entities: [neutralToken] } as any).entities[0];
      const normPlayer = normalizeGameState({ id: 'g', entities: [playerToken] } as any).entities[0];
      const normEnemy = normalizeGameState({ id: 'g', entities: [enemyToken] } as any).entities[0];

      expect(normNeutral.showRing).toBe(false);
      expect(normPlayer.showRing).toBe(true);
      expect(normEnemy.showRing).toBe(true);
    });

    it('al cambiar el bando de un token se aplica el valor por defecto del nuevo bando salvo que el usuario lo haya cambiado a mano', () => {
      const token: Entity = {
        id: 'tok_change',
        type: 'token',
        name: 'Cambiante',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: false,
        locked: false,
        side: 'neutral',
        showRing: false
      };
      useGameStore.getState().addEntity(token);

      // Cambiar a jugador -> activa anillo por defecto
      useGameStore.getState().updateEntity('tok_change', { side: 'jugador' });
      let ent = useGameStore.getState().game.entities.find((e) => e.id === 'tok_change')!;
      expect(ent.side).toBe('jugador');
      expect(ent.showRing).toBe(true);

      // Cambiar a neutral -> desactiva anillo por defecto
      useGameStore.getState().updateEntity('tok_change', { side: 'neutral' });
      ent = useGameStore.getState().game.entities.find((e) => e.id === 'tok_change')!;
      expect(ent.side).toBe('neutral');
      expect(ent.showRing).toBe(false);

      // El usuario activa a mano el anillo en el token neutral
      useGameStore.getState().updateEntity('tok_change', { showRing: true, showRingCustom: true });
      ent = useGameStore.getState().game.entities.find((e) => e.id === 'tok_change')!;
      expect(ent.showRing).toBe(true);
      expect(ent.showRingCustom).toBe(true);

      // Cambiar de nuevo de bando (a enemigo o neutral): se respeta la decisión manual del usuario
      useGameStore.getState().updateEntity('tok_change', { side: 'neutral' });
      ent = useGameStore.getState().game.entities.find((e) => e.id === 'tok_change')!;
      expect(ent.side).toBe('neutral');
      expect(ent.showRing).toBe(true); // Se conserva porque showRingCustom es true
    });

    it('las partidas existentes se actualizan al cargar: neutrales pierden anillo, los demás lo conservan', () => {
      const legacyGame = {
        id: 'legacy',
        entities: [
          {
            id: 'tok_old_neutral',
            type: 'token',
            name: 'Aldeano Legacy',
            side: 'neutral'
          },
          {
            id: 'tok_old_player',
            type: 'token',
            name: 'Guerrero Legacy',
            side: 'jugador'
          },
          {
            id: 'tok_old_enemy',
            type: 'token',
            name: 'Orco Legacy',
            side: 'enemigo'
          }
        ]
      };

      const normalized = normalizeGameState(legacyGame as any);
      const neutral = normalized.entities.find((e) => e.id === 'tok_old_neutral')!;
      const player = normalized.entities.find((e) => e.id === 'tok_old_player')!;
      const enemy = normalized.entities.find((e) => e.id === 'tok_old_enemy')!;

      expect(neutral.showRing).toBe(false);
      expect(player.showRing).toBe(true);
      expect(enemy.showRing).toBe(true);
    });

    it('al duplicar un token, la copia conserva el estado del anillo y la marca personalizada', () => {
      const original: Entity = {
        id: 'tok_custom_ring',
        type: 'token',
        name: 'Mago Con Anillo Desactivado',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 10,
        visibleToPlayers: true,
        locked: false,
        side: 'jugador',
        showRing: false,
        showRingCustom: true
      };
      useGameStore.getState().addEntity(original);
      const copyId = useGameStore.getState().duplicateEntity('tok_custom_ring')!;
      expect(copyId).toBeDefined();

      const copy = useGameStore.getState().game.entities.find((e) => e.id === copyId)!;
      expect(copy.side).toBe('jugador');
      expect(copy.showRing).toBe(false);
      expect(copy.showRingCustom).toBe(true);
    });
  });
});
