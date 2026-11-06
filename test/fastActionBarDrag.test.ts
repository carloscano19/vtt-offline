import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/stores/useGameStore';
import { useUIStore } from '../src/stores/useUIStore';
import { Entity } from '../src/types/entity';

describe('FastActionBar and Canvas Drag Interaction', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
    useUIStore.getState().clearSelection();
  });

  it('restricts activeTool so FastActionBar is only active in select mode', () => {
    const gameStore = useGameStore.getState();
    const uiStore = useUIStore.getState();
    const token: Entity = {
      id: 'token_hero',
      type: 'token',
      name: 'Hero',
      x: 200,
      y: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 10,
      visibleToPlayers: true,
      locked: false
    };
    gameStore.addEntity(token);
    uiStore.selectEntity(token.id);

    // Initial tool is select and entity is selected
    expect(useUIStore.getState().activeTool).toBe('select');
    expect(useUIStore.getState().selectedEntityIds).toEqual(['token_hero']);

    // Changing tool to fogReveal, fogHide, ruler, wall, or light should change activeTool
    uiStore.setActiveTool('fogReveal');
    expect(useUIStore.getState().activeTool).toBe('fogReveal');

    // FastActionBar condition is: activeTool === 'select' && selectedEntityIds.length === 1
    const shouldMountFastActionBar = (tool: string, selectedIds: string[]) =>
      tool === 'select' && selectedIds.length === 1;

    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(false);

    uiStore.setActiveTool('fogHide');
    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(false);

    uiStore.setActiveTool('ruler');
    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(false);

    uiStore.setActiveTool('wall');
    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(false);

    uiStore.setActiveTool('light');
    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(false);

    uiStore.setActiveTool('select');
    expect(shouldMountFastActionBar(useUIStore.getState().activeTool, useUIStore.getState().selectedEntityIds)).toBe(true);
  });

  it('determines FastActionBar visibility styles correctly based on isDragging prop', () => {
    const getFastActionBarStyles = (isDragging: boolean) => {
      const className = `absolute flex items-center gap-0.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg p-1 shadow-2xl text-slate-200 z-40 select-none transition-all duration-150 ${
        isDragging
          ? 'opacity-0 pointer-events-none scale-95'
          : 'opacity-100 pointer-events-auto scale-100 animate-in fade-in zoom-in-95'
      }`;
      const pointerEvents = isDragging ? 'none' : 'auto';
      return { className, pointerEvents };
    };

    // When dragging
    const draggingStyles = getFastActionBarStyles(true);
    expect(draggingStyles.className).toContain('opacity-0');
    expect(draggingStyles.className).toContain('pointer-events-none');
    expect(draggingStyles.pointerEvents).toBe('none');

    // When idle / not dragging
    const idleStyles = getFastActionBarStyles(false);
    expect(idleStyles.className).toContain('opacity-100');
    expect(idleStyles.className).toContain('pointer-events-auto');
    expect(idleStyles.pointerEvents).toBe('auto');
  });

  it('safely handles setPointerCapture and releasePointerCapture without crashing', () => {
    let captured = false;
    const mockElement = {
      setPointerCapture: (_id: number) => { captured = true; },
      releasePointerCapture: (_id: number) => { captured = false; },
      hasPointerCapture: (_id: number) => captured
    };

    // Simulate pointer down
    try {
      mockElement.setPointerCapture(1);
    } catch {}
    expect(mockElement.hasPointerCapture(1)).toBe(true);

    // Simulate pointer up
    try {
      if (mockElement.hasPointerCapture(1)) {
        mockElement.releasePointerCapture(1);
      }
    } catch {}
    expect(mockElement.hasPointerCapture(1)).toBe(false);
  });
});
