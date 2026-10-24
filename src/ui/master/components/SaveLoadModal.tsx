import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import {
  saveGameToDb,
  loadGameFromDb,
  listSavedGames,
  deleteSavedGame,
  loadAutoSaveFromDb
} from '../../../modules/persistence/saveManager';
import { exportVttSave, importVttSave } from '../../../modules/persistence/exporter';
import { StoredGame } from '../../../db/dexie';
import { X, Save, FilePlus, Download, Upload, Trash2, RotateCcw, Clock } from 'lucide-react';

export const SaveLoadModal: React.FC = () => {
  const showSaveLoadModal = useUIStore((s) => s.showSaveLoadModal);
  const setShowSaveLoadModal = useUIStore((s) => s.setShowSaveLoadModal);

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const resetGame = useGameStore((s) => s.resetGame);

  const [savedGames, setSavedGames] = useState<StoredGame[]>([]);
  const [gameName, setGameName] = useState(game.name || 'Mi Partida');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = async () => {
    const list = await listSavedGames();
    setSavedGames(list);
  };

  useEffect(() => {
    if (showSaveLoadModal) {
      setGameName(game.name || 'Mi Partida');
      refreshList();
    }
  }, [showSaveLoadModal, game.name]);

  if (!showSaveLoadModal) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // 1. Guardar partida actual
  const handleSave = async () => {
    const updated = { ...game, name: gameName };
    await saveGameToDb(updated);
    setGame(updated);
    await refreshList();
    showStatus('¡Partida guardada correctamente!');
  };

  // 2. Guardar como...
  const handleSaveAs = async () => {
    const newName = prompt('Nombre para la nueva copia de la partida:', `${gameName} (Copia)`);
    if (!newName || !newName.trim()) return;
    const trimmed = newName.trim();
    const newId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    const newGame = {
      ...game,
      id: newId,
      name: trimmed,
      createdAt: now,
      updatedAt: now
    };
    await saveGameToDb(newGame);
    setGame(newGame);
    setGameName(trimmed);
    await refreshList();
    showStatus(`Partida guardada como "${trimmed}"`);
  };

  // 3. Nueva partida
  const handleNewGame = () => {
    if (confirm('¿Crear una nueva partida? Asegúrate de haber guardado los cambios de la actual.')) {
      resetGame();
      setShowSaveLoadModal(false);
    }
  };

  // 4. Cargar partida
  const handleLoad = async (id: string) => {
    const loaded = await loadGameFromDb(id);
    if (loaded) {
      setGame(loaded);
      setShowSaveLoadModal(false);
    }
  };

  // 5. Cargar último autoguardado
  const handleLoadAutoSave = async () => {
    const auto = await loadAutoSaveFromDb();
    if (auto) {
      if (confirm('¿Restaurar el último autoguardado?')) {
        setGame(auto);
        setShowSaveLoadModal(false);
      }
    } else {
      alert('No hay ningún autoguardado previo registrado.');
    }
  };

  // 6. Eliminar partida
  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de eliminar la partida guardada "${name}"?`)) {
      await deleteSavedGame(id);
      await refreshList();
    }
  };

  // 7. Exportar .vttsave (ZIP)
  const handleExport = async () => {
    try {
      showStatus('Generando archivo .vttsave...');
      const zipBlob = await exportVttSave(game);

      if (window.electronAPI) {
        // En Electron: diálogo nativo para guardar archivo
        const res = await window.electronAPI.showSaveDialog({
          title: 'Exportar Partida VTT',
          defaultPath: `${game.name || 'partida'}.vttsave`,
          filters: [{ name: 'VTT Save File', extensions: ['vttsave'] }]
        });

        if (!res.canceled && res.filePath) {
          const arrayBuffer = await zipBlob.arrayBuffer();
          await window.electronAPI.writeFileFromArrayBuffer(res.filePath, arrayBuffer);
          showStatus('¡Archivo .vttsave exportado con éxito!');
        }
      } else {
        // Fallback web estándar
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${game.name || 'partida'}.vttsave`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('¡Archivo .vttsave descargado!');
      }
    } catch (err) {
      console.error('Error al exportar:', err);
      alert('Error al exportar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // 8. Importar .vttsave (ZIP)
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImported = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showStatus('Importando archivo .vttsave y assets...');
      const buffer = await file.arrayBuffer();
      const importedGame = await importVttSave(buffer);
      await saveGameToDb(importedGame);
      setGame(importedGame);
      await refreshList();
      showStatus('¡Partida importada y cargada con éxito!');
      setShowSaveLoadModal(false);
    } catch (err) {
      console.error('Error al importar:', err);
      alert('Error al importar partida: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".vttsave"
        className="hidden"
        onChange={handleFileImported}
      />

      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[500px] max-h-[85vh] flex flex-col text-slate-200">
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-sm text-white">Gestor de Partidas</h3>
          </div>
          <button onClick={() => setShowSaveLoadModal(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusMessage && (
          <div className="bg-sky-950/80 border-b border-sky-500/50 px-4 py-2 text-xs text-sky-300 font-medium text-center">
            {statusMessage}
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Nombre y guardado actual */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Nombre de la partida actual</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar</span>
              </button>
              <button
                onClick={handleSaveAs}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded font-medium transition-colors"
              >
                Guardar como...
              </button>
            </div>
          </div>

          {/* Acciones principales: Nueva, Exportar, Importar, Autoguardado */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <button
              onClick={handleNewGame}
              className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-white"
            >
              <FilePlus className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px]">Nueva partida</span>
            </button>
            <button
              onClick={handleExport}
              className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-white"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span className="text-[11px]">Exportar .vttsave</span>
            </button>
            <button
              onClick={handleImportClick}
              className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-white"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span className="text-[11px]">Importar .vttsave</span>
            </button>
            <button
              onClick={handleLoadAutoSave}
              className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-white"
              title="Restaurar copia de seguridad automática"
            >
              <RotateCcw className="w-4 h-4 text-purple-400" />
              <span className="text-[11px]">Autoguardado</span>
            </button>
          </div>

          {/* Lista de partidas guardadas en el equipo */}
          <div className="space-y-2 pt-2 border-t border-slate-700/80">
            <span className="text-slate-400 font-medium block">Partidas guardadas en este equipo</span>
            {savedGames.length === 0 ? (
              <div className="p-4 text-center text-slate-500 bg-slate-800/40 rounded border border-slate-800">
                Aún no has guardado ninguna partida.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {savedGames.map((item) => {
                  const dateStr = new Date(item.updatedAt).toLocaleString();
                  const isCurrent = item.id === game.id;

                  return (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded border flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-sky-950/40 border-sky-600/70'
                          : 'bg-slate-800/70 border-slate-700/70'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate text-xs">{item.name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-sky-900 text-sky-300 rounded font-bold uppercase">
                              Actual
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{dateStr}</span>
                          <span className="text-slate-600">•</span>
                          <span>{item.data?.entities?.length || 0} entidades</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleLoad(item.id)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium text-xs transition-colors"
                        >
                          Cargar
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Eliminar partida"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pie con recordatorio de autoguardado */}
        <div className="p-3 border-t border-slate-700/80 text-[11px] text-slate-500 text-center bg-slate-900/80">
          Autoguardado activo cada 60 segundos y automáticamente al cerrar la aplicación.
        </div>
      </div>
    </div>
  );
};
