import { create } from 'zustand';
import { Point2D } from '../types/entity';
import { DiagonalRule, RulerMode, RulerState } from '../types/game';

export type ActiveTool = 'select' | 'pan' | 'ruler' | 'wall';
export type SidebarTab = 'properties' | 'layers' | 'library';

interface UIStoreState {
  activeTool: ActiveTool;
  selectedEntityIds: string[];
  activeSidebarTab: SidebarTab | null;

  // Regla
  ruler: RulerState & { measuring: boolean };

  // Modales y overlays
  showDebugVttOverlay: boolean;
  showSaveLoadModal: boolean;
  showDisplaysModal: boolean;

  // Acciones
  setActiveTool: (tool: ActiveTool) => void;
  setSelectedEntityIds: (ids: string[]) => void;
  selectEntity: (id: string, multiple?: boolean) => void;
  clearSelection: () => void;
  setActiveSidebarTab: (tab: SidebarTab | null) => void;

  setRulerMode: (mode: RulerMode) => void;
  setRulerDiagonalRule: (rule: DiagonalRule) => void;
  setRulerVisibleToPlayers: (visible: boolean) => void;
  startRulerMeasure: (pos: Point2D) => void;
  updateRulerMeasure: (pos: Point2D) => void;
  endRulerMeasure: () => void;
  clearRuler: () => void;

  setShowDebugVttOverlay: (show: boolean) => void;
  setShowSaveLoadModal: (show: boolean) => void;
  setShowDisplaysModal: (show: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  activeTool: 'select',
  selectedEntityIds: [],
  activeSidebarTab: 'properties',

  ruler: {
    active: false,
    measuring: false,
    mode: 'straight',
    diagonalRule: '5e',
    startPos: null,
    currentPos: null,
    visibleToPlayers: false
  },

  showDebugVttOverlay: true,
  showSaveLoadModal: false,
  showDisplaysModal: false,

  setActiveTool: (tool) => {
    set((state) => ({
      activeTool: tool,
      ruler: {
        ...state.ruler,
        active: tool === 'ruler',
        measuring: false,
        startPos: null,
        currentPos: null
      }
    }));
  },

  setSelectedEntityIds: (ids) => set({ selectedEntityIds: ids }),

  selectEntity: (id, multiple = false) => {
    set((state) => {
      if (multiple) {
        const exists = state.selectedEntityIds.includes(id);
        return {
          selectedEntityIds: exists
            ? state.selectedEntityIds.filter((item) => item !== id)
            : [...state.selectedEntityIds, id]
        };
      }
      return { selectedEntityIds: [id] };
    });
  },

  clearSelection: () => set({ selectedEntityIds: [] }),

  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  setRulerMode: (mode) =>
    set((state) => ({
      ruler: { ...state.ruler, mode }
    })),

  setRulerDiagonalRule: (diagonalRule) =>
    set((state) => ({
      ruler: { ...state.ruler, diagonalRule }
    })),

  setRulerVisibleToPlayers: (visibleToPlayers) =>
    set((state) => ({
      ruler: { ...state.ruler, visibleToPlayers }
    })),

  startRulerMeasure: (pos) =>
    set((state) => ({
      ruler: {
        ...state.ruler,
        active: true,
        measuring: true,
        startPos: pos,
        currentPos: pos
      }
    })),

  updateRulerMeasure: (pos) =>
    set((state) => {
      if (!state.ruler.measuring) return state;
      return {
        ruler: {
          ...state.ruler,
          currentPos: pos
        }
      };
    }),

  endRulerMeasure: () =>
    set((state) => ({
      ruler: {
        ...state.ruler,
        measuring: false
      }
    })),

  clearRuler: () =>
    set((state) => ({
      ruler: {
        ...state.ruler,
        startPos: null,
        currentPos: null,
        measuring: false
      }
    })),

  setShowDebugVttOverlay: (show) => set({ showDebugVttOverlay: show }),
  setShowSaveLoadModal: (show) => set({ showSaveLoadModal: show }),
  setShowDisplaysModal: (show) => set({ showDisplaysModal: show })
}));
