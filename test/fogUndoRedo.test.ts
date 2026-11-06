import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { syncChannel } from '../src/modules/sync/syncChannel';

describe('Bloque 3: Deshacer y rehacer al revelar, ocultar y reiniciar niebla', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useGameStore.getState().resetGame();
  });

  it('deshacer quita la última zona revelada y rehacer la vuelve a poner', () => {
    const sendStateSpy = vi.spyOn(syncChannel, 'sendState');
    const store = useGameStore.getState();

    // Inicialmente no hay zonas reveladas
    expect(store.game.fog.revealed?.length || 0).toBe(0);
    expect(store.canUndo()).toBe(false);

    // 1. Revelar un rectángulo (100, 100, 200, 200)
    store.revealFogRect({ x: 100, y: 100, width: 200, height: 200 });

    const stateAfterReveal = useGameStore.getState();
    expect(stateAfterReveal.game.fog.revealed?.length).toBeGreaterThan(0);
    expect(stateAfterReveal.canUndo()).toBe(true);
    expect(stateAfterReveal.canRedo()).toBe(false);
    expect(sendStateSpy).toHaveBeenCalledWith(stateAfterReveal.game, true);

    // 2. Deshacer
    useGameStore.getState().undo();

    const stateAfterUndo = useGameStore.getState();
    expect(stateAfterUndo.game.fog.revealed?.length || 0).toBe(0);
    expect(stateAfterUndo.canUndo()).toBe(false);
    expect(stateAfterUndo.canRedo()).toBe(true);
    expect(sendStateSpy).toHaveBeenCalledWith(stateAfterUndo.game, true);

    // 3. Rehacer
    useGameStore.getState().redo();

    const stateAfterRedo = useGameStore.getState();
    expect(stateAfterRedo.game.fog.revealed?.length).toBeGreaterThan(0);
    expect(stateAfterRedo.canUndo()).toBe(true);
    expect(stateAfterRedo.canRedo()).toBe(false);
    expect(sendStateSpy).toHaveBeenCalledWith(stateAfterRedo.game, true);
  });

  it('deshacer y rehacer ocultar niebla', () => {
    const store = useGameStore.getState();

    // Revelar zona amplia
    store.revealFogRect({ x: 0, y: 0, width: 500, height: 500 });
    const revealedBefore = useGameStore.getState().game.fog.revealed;

    // Ocultar parte central
    store.hideFogRect({ x: 100, y: 100, width: 200, height: 200 });
    const revealedAfterHide = useGameStore.getState().game.fog.revealed;
    expect(revealedAfterHide).not.toEqual(revealedBefore);

    // Deshacer ocultamiento
    useGameStore.getState().undo();
    expect(useGameStore.getState().game.fog.revealed).toEqual(revealedBefore);

    // Rehacer ocultamiento
    useGameStore.getState().redo();
    expect(useGameStore.getState().game.fog.revealed).toEqual(revealedAfterHide);
  });

  it('reiniciar niebla puede deshacerse si se pulsa por error', () => {
    const store = useGameStore.getState();

    // Revelar zona
    store.revealFogRect({ x: 50, y: 50, width: 300, height: 300 });
    const revealedBeforeReset = useGameStore.getState().game.fog.revealed;
    expect(revealedBeforeReset?.length).toBeGreaterThan(0);

    // Reiniciar niebla
    store.resetFogExploration();
    expect(useGameStore.getState().game.fog.revealed?.length || 0).toBe(0);
    expect(useGameStore.getState().game.fog.explored?.length || 0).toBe(0);

    // Deshacer reinicio
    useGameStore.getState().undo();
    expect(useGameStore.getState().game.fog.revealed).toEqual(revealedBeforeReset);
  });
});
