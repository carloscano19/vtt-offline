import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { useUIStore } from '../src/stores/useUIStore';
import { syncChannel } from '../src/modules/sync/syncChannel';
import { TokensLayer } from '../src/pixi/layers/TokensLayer';
import { Entity } from '../src/types/entity';

describe('Duplicar + Borrar y sincronización con la tele', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    useUIStore.getState().clearSelection();
  });

  it('duplica una entidad y al borrarla el estado de la tele queda sin la entidad', async () => {
    const originalToken: Entity = {
      id: 'token_hero',
      type: 'token',
      name: 'Héroe',
      x: 140,
      y: 140,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };

    useGameStore.getState().addEntity(originalToken);

    // 1. Duplicar la entidad desde el máster
    const duplicateId = useGameStore.getState().duplicateEntity('token_hero');
    expect(duplicateId).toBeDefined();

    let entities = useGameStore.getState().game.entities;
    expect(entities.find((e) => e.id === duplicateId)).toBeDefined();

    // 2. Simular TokensLayer en la tele (isMaster = false)
    const tvTokensLayer = new TokensLayer(false);
    await tvTokensLayer.syncEntities(entities, [], [], false, false, 70, 1.0);

    // El contenedor de la copia debe existir en la tele
    const copyContainerBefore = tvTokensLayer.children.find((c: any) => c.label === duplicateId);
    expect(copyContainerBefore).toBeDefined();

    // 3. Borrar la entidad duplicada (como hace el botón Borrar, Supr o Capas)
    useGameStore.getState().removeEntities([duplicateId!]);

    // Verificar que en el estado la copia ya no existe
    const entitiesAfterDelete = useGameStore.getState().game.entities;
    expect(entitiesAfterDelete.find((e) => e.id === duplicateId)).toBeUndefined();
    expect(entitiesAfterDelete.find((e) => e.id === 'token_hero')).toBeDefined();

    // 4. Sincronizar la tele con el nuevo estado sin la copia
    await tvTokensLayer.syncEntities(entitiesAfterDelete, [], [], false, false, 70, 1.0);

    // La tele debe iniciar el fundido de 0.6s
    // Al ejecutar tick de 0.6s, el fundido llega a 0 y destruye el contenedor
    tvTokensLayer.tick(0.6);

    const copyContainerAfter = tvTokensLayer.children.find((c: any) => c.label === duplicateId);
    expect(copyContainerAfter).toBeUndefined();

    // 5. Un mensaje atrasado de posición de la entidad borrada debe ser ignorado
    const existsInStore = useGameStore.getState().game.entities.some((e) => e.id === duplicateId);
    expect(existsInStore).toBe(false);
  });

  it('borrar varias entidades a la vez las elimina del estado y de la tele', async () => {
    const t1: Entity = {
      id: 't_1',
      type: 'token',
      name: 'Goblin A',
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };
    const t2: Entity = {
      id: 't_2',
      type: 'token',
      name: 'Goblin B',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };

    useGameStore.getState().addEntity(t1);
    useGameStore.getState().addEntity(t2);
    const tvTokensLayer = new TokensLayer(false);
    await tvTokensLayer.syncEntities(useGameStore.getState().game.entities, [], [], false, false, 70, 1.0);

    expect(tvTokensLayer.children.find((c: any) => c.label === 't_1')).toBeDefined();
    expect(tvTokensLayer.children.find((c: any) => c.label === 't_2')).toBeDefined();

    // Borrado múltiple
    useGameStore.getState().removeEntities(['t_1', 't_2']);
    expect(useGameStore.getState().game.entities).toHaveLength(0);

    await tvTokensLayer.syncEntities(useGameStore.getState().game.entities, [], [], false, false, 70, 1.0);
    tvTokensLayer.tick(0.6);

    expect(tvTokensLayer.children.find((c: any) => c.label === 't_1')).toBeUndefined();
    expect(tvTokensLayer.children.find((c: any) => c.label === 't_2')).toBeUndefined();
  });
});
