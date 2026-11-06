import { describe, it, expect } from 'vitest';
import { normalizeGameState, normalizeEntity } from '../src/modules/persistence/normalizer';
import { useGameStore } from '../src/stores/useGameStore';
import { TokensLayer } from '../src/pixi/layers/TokensLayer';
import { Entity } from '../src/types/entity';

describe('Token Names and Compact Statuses (Bloque 6)', () => {
  it('normalizes tokenNameVisibility to master_only by default', () => {
    const raw: any = {
      id: 'g1',
      name: 'Game',
      entities: []
    };
    const normalized = normalizeGameState(raw);
    expect(normalized.tokenNameVisibility).toBe('master_only');
  });

  it('preserves hideName on normalized entities', () => {
    const rawEntity: any = {
      id: 'tok1',
      type: 'token',
      name: 'Goblin',
      x: 100,
      y: 100,
      hideName: true
    };
    const norm = normalizeEntity(rawEntity);
    expect(norm.hideName).toBe(true);
  });

  it('updates tokenNameVisibility in game store', () => {
    const store = useGameStore.getState();
    store.setTokenNameVisibility('all');
    expect(useGameStore.getState().game.tokenNameVisibility).toBe('all');
    store.setTokenNameVisibility('none');
    expect(useGameStore.getState().game.tokenNameVisibility).toBe('none');
    store.setTokenNameVisibility('master_only');
    expect(useGameStore.getState().game.tokenNameVisibility).toBe('master_only');
  });

  it('respects tokenNameVisibility and hideName in TokensLayer', async () => {
    const masterLayer = new TokensLayer(true);
    const playerLayer = new TokensLayer(false);

    const goblin: Entity = {
      id: 'goblin1',
      type: 'token',
      name: 'Goblin Oculto',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      hideName: false
    };

    // 1. Con master_only (defecto)
    masterLayer.setTokenNameVisibility('master_only');
    await masterLayer.syncEntities([goblin], [], [], false, false, 70, 1, null);
    let masterContainer = (masterLayer as any).containerMap.get('goblin1');
    let nameText = masterContainer?.children.find((c: any) => c.text === 'Goblin Oculto');
    expect(nameText?.visible).toBe(true);

    playerLayer.setTokenNameVisibility('master_only');
    await playerLayer.syncEntities([goblin], [], [], false, false, 70, 1, null);
    let playerContainer = (playerLayer as any).containerMap.get('goblin1');
    nameText = playerContainer?.children.find((c: any) => c.text === 'Goblin Oculto');
    expect(nameText?.visible).toBe(false);

    // 2. Con 'all'
    playerLayer.setTokenNameVisibility('all');
    await playerLayer.syncEntities([goblin], [], [], false, false, 70, 1, null);
    playerContainer = (playerLayer as any).containerMap.get('goblin1');
    nameText = playerContainer?.children.find((c: any) => c.text === 'Goblin Oculto');
    expect(nameText?.visible).toBe(true);

    // 3. Con 'none'
    masterLayer.setTokenNameVisibility('none');
    await masterLayer.syncEntities([goblin], [], [], false, false, 70, 1, null);
    masterContainer = (masterLayer as any).containerMap.get('goblin1');
    nameText = masterContainer?.children.find((c: any) => c.text === 'Goblin Oculto');
    expect(nameText?.visible).toBe(false);

    // 4. Con hideName: true, nunca se muestra aunque sea 'all'
    const secretGoblin: Entity = { ...goblin, hideName: true };
    playerLayer.setTokenNameVisibility('all');
    await playerLayer.syncEntities([secretGoblin], [], [], false, false, 70, 1, null);
    playerContainer = (playerLayer as any).containerMap.get('goblin1');
    nameText = playerContainer?.children.find((c: any) => c.text === 'Goblin Oculto');
    expect(nameText?.visible).toBe(false);
  });

  it('renders statuses in a single compact badge', async () => {
    const layer = new TokensLayer(true);
    const tokenWithStatuses: Entity = {
      id: 't_stat',
      type: 'token',
      name: 'Hero',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false,
      statuses: [
        { id: 's1', type: 'Aturdido', turnsRemaining: 3, visibleToPlayers: true },
        { id: 's2', type: 'Envenenado', turnsRemaining: 2, visibleToPlayers: true }
      ]
    };

    await layer.syncEntities([tokenWithStatuses], [], [], false, false, 70, 1, null);
    const cont = (layer as any).containerMap.get('t_stat');
    const statusesCont = cont?.children.find((c: any) => c.label === 'statuses');
    expect(statusesCont).toBeDefined();
    expect(statusesCont?.visible).toBe(true);
    // Debe haber un solo badgeItem hijo en statusesContainer que junta los estados en una sola pastilla
    expect(statusesCont?.children.length).toBe(1);
    const badgeItem = statusesCont?.children[0];
    const textChild = badgeItem?.children.find((c: any) => c.text !== undefined) as any;
    expect(textChild?.text).toBe('Atur 3 · Env 2');
  });
});
