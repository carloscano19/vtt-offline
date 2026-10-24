import { useEffect } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { saveAutoSaveToDb } from '../../../modules/persistence/saveManager';

export function useKeyboardShortcuts() {
  const game = useGameStore((s) => s.game);
  const undo = useGameStore((s) => s.undo);
  const redo = useGameStore((s) => s.redo);
  const removeEntities = useGameStore((s) => s.removeEntities);

  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const setShowSaveLoadModal = useUIStore((s) => s.setShowSaveLoadModal);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      // 1. Borrar entidades seleccionadas con Supr / Backspace (si no se está escribiendo en un input)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedEntityIds.length > 0) {
          e.preventDefault();
          removeEntities(selectedEntityIds);
          clearSelection();
        }
        return;
      }

      // 2. Escape: limpiar selección
      if (e.key === 'Escape' && !isInput) {
        clearSelection();
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // 3. Guardado rápido Ctrl+S / Cmd+S
      if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAutoSaveToDb(game).then(() => {
          setShowSaveLoadModal(true);
        });
        return;
      }

      // 4. Deshacer Ctrl+Z / Cmd+Z (sin Shift)
      if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // 5. Rehacer Ctrl+Y o Ctrl+Shift+Z / Cmd+Shift+Z
      if (isCtrlOrCmd && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game, selectedEntityIds, undo, redo, removeEntities, clearSelection, setShowSaveLoadModal]);
}
