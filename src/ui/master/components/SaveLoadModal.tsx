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
import { clearAdventure } from '../../../modules/persistence/adventureManager';
import { cloudGameSync } from '../../../modules/persistence/cloudGameSync';
import { cloudSync } from '../../../modules/sync/cloudSync';
import { StoredGame } from '../../../db/dexie';
import { X, Save, FilePlus, Download, Upload, Trash2, RotateCcw, Clock, Check, Copy, AlertCircle, AlertTriangle } from 'lucide-react';

export const SaveLoadModal: React.FC = () => {
  const showSaveLoadModal = useUIStore((s) => s.showSaveLoadModal);
  const setShowSaveLoadModal = useUIStore((s) => s.setShowSaveLoadModal);

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const resetGame = useGameStore((s) => s.resetGame);

  const [savedGames, setSavedGames] = useState<StoredGame[]>([]);
  const [gameName, setGameName] = useState(game.name || 'Nueva Partida');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const duplicateInputRef = useRef<HTMLInputElement>(null);

  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const refreshList = async () => {
    const list = await listSavedGames();
    setSavedGames(list);
  };

  // Mantener el nombre del campo siempre sincronizado con game.name cuando se abre el modal o cambia game.id / game.name
  useEffect(() => {
    if (showSaveLoadModal) {
      setGameName(game.name || 'Nueva Partida');
      setIsDuplicating(false);
      setDuplicateName('');
      refreshList();
    }
  }, [showSaveLoadModal, game.id, game.name]);

  useEffect(() => {
    if (isDuplicating) {
      duplicateInputRef.current?.focus();
      duplicateInputRef.current?.select();
    }
  }, [isDuplicating]);

  if (!showSaveLoadModal) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // 1. Guardar partida actual
  const handleSave = async () => {
    const updated = { ...game, name: gameName, updatedAt: Date.now() };
    await saveGameToDb(updated);
    setGame(updated);
    await refreshList();
    showStatus('¡Partida guardada correctamente!');
  };

  // 2. Duplicar partida (antiguo "Guardar como")
  const startDuplicate = () => {
    setDuplicateName(`${gameName} (Copia)`);
    setIsDuplicating(true);
  };

  const cancelDuplicate = () => {
    setIsDuplicating(false);
    setDuplicateName('');
  };

  const confirmDuplicate = async () => {
    const trimmed = duplicateName.trim();
    if (!trimmed) return;
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
    setIsDuplicating(false);
    await refreshList();
    showStatus(`Partida duplicada como "${trimmed}"`);
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
      setGameName(loaded.name);
      setShowSaveLoadModal(false);
    }
  };

  // 5. Cargar último autoguardado
  const handleLoadAutoSave = async () => {
    const auto = await loadAutoSaveFromDb();
    if (auto) {
      if (confirm('¿Restaurar el último autoguardado?')) {
        setGame(auto);
        setGameName(auto.name);
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

  // 7. Guardar en archivo... (File System Access API o fallback descarga)
  const handleExport = async () => {
    try {
      showStatus('Generando archivo .vttsave...');
      const zipBlob = await exportVttSave(game);
      const suggestedFileName = `${(game.name || 'partida').replace(/[/\\?%*:|"<>]/g, '_')}.vttsave`;

      // Comprobar File System Access API (Chrome/Edge moderno)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: suggestedFileName,
            types: [
              {
                description: 'VTT Save File',
                accept: { 'application/zip': ['.vttsave'] }
              }
            ]
          });
          const writable = await handle.createWritable();
          await writable.write(zipBlob);
          await writable.close();
          showStatus('¡Archivo guardado con éxito!');
          return;
        } catch (err: any) {
          // Si el usuario canceló el selector de archivos, no hacer fallback
          if (err.name === 'AbortError') return;
          console.warn('Fallo showSaveFilePicker, recurriendo a descarga clásica:', err);
        }
      }

      // Fallback web tradicional de descarga
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedFileName;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('¡Archivo .vttsave descargado!');
    } catch (err) {
      console.error('Error al guardar en archivo:', err);
      alert('Error al guardar en archivo: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // 8. Abrir archivo... (File System Access API o fallback input file)
  const handleImportClick = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'VTT Save File',
              accept: { 'application/zip': ['.vttsave'] }
            }
          ],
          multiple: false
        });
        const file = await fileHandle.getFile();
        await processImportFile(file);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('Fallo showOpenFilePicker, recurriendo a input file:', err);
      }
    }

    fileInputRef.current?.click();
  };

  const processImportFile = async (file: File) => {
    try {
      showStatus('Importando archivo .vttsave y assets...');
      const buffer = await file.arrayBuffer();
      const importedGame = await importVttSave(buffer);
      await saveGameToDb(importedGame);
      setGame(importedGame);
      setGameName(importedGame.name);
      await refreshList();
      // Pasa a ser la aventura actual y se sube de inmediato a la nube
      cloudGameSync.saveImmediate(importedGame);
      cloudSync.processQueue();
      showStatus('¡Partida importada, cargada y sincronizada con la nube!');
      setShowSaveLoadModal(false);
    } catch (err) {
      console.error('Error al importar:', err);
      alert('Error al abrir archivo de partida: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleFileImported = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[520px] max-h-[85vh] flex flex-col text-slate-200">
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
                onClick={startDuplicate}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white rounded font-medium flex items-center gap-1.5 transition-colors"
                title="Crea una copia independiente de la partida actual"
              >
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Duplicar partida</span>
              </button>
            </div>

            {/* Campo desplegable para Duplicar partida */}
            {isDuplicating && (
              <div className="mt-2 p-2.5 bg-slate-800/90 border border-sky-500/60 rounded-md space-y-2 shadow-inner">
                <label className="text-[11px] text-sky-300 font-medium block">
                  Nombre para la copia de la partida:
                </label>
                <div className="flex gap-2">
                  <input
                    ref={duplicateInputRef}
                    type="text"
                    value={duplicateName}
                    onChange={(e) => setDuplicateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmDuplicate();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelDuplicate();
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
                    placeholder="Nombre de la nueva copia"
                  />
                  <button
                    onClick={confirmDuplicate}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
                    title="Confirmar (Enter)"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar</span>
                  </button>
                  <button
                    onClick={cancelDuplicate}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-medium flex items-center gap-1 transition-colors"
                    title="Cancelar (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Acciones principales: Nueva, Guardar en archivo, Abrir archivo, Autoguardado */}
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
              title="Guardar archivo .vttsave en tu disco con File System API"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span className="text-[11px]">Guardar en archivo...</span>
            </button>
            <button
              onClick={handleImportClick}
              className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-white"
              title="Abrir archivo .vttsave desde tu equipo"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span className="text-[11px]">Abrir archivo...</span>
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

          {/* Aviso discreto PWA */}
          <div className="p-2 bg-slate-800/40 border border-slate-700/60 rounded flex items-center gap-2 text-[11px] text-slate-400">
            <AlertCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Las partidas se guardan en este navegador. Usa <strong>"Guardar en archivo..."</strong> para hacer copias de seguridad.</span>
          </div>

          {/* Lista de partidas guardadas en el navegador */}
          <div className="space-y-2 pt-1 border-t border-slate-700/80">
            <span className="text-slate-400 font-medium block">Partidas guardadas en este navegador</span>
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

          {/* Zona de peligro: Borrar aventura */}
          <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between gap-3 bg-rose-950/20 p-2.5 rounded border border-rose-900/40">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-rose-300 block">Zona de peligro: Borrar aventura</span>
              <span className="text-[11px] text-slate-400">
                Borra todos los mapas y partidas del navegador. Conserva tus tokens, objetos y música.
              </span>
            </div>
            <button
              onClick={() => setShowWipeConfirm(true)}
              className="px-3 py-1.5 rounded text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/70 hover:bg-rose-900 border border-rose-800 transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
              title="Borrar todos los mapas, partidas y niebla de esta aventura"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Borrar aventura...</span>
            </button>
          </div>
        </div>

        {/* Pie con recordatorio de autoguardado */}
        <div className="p-3 border-t border-slate-700/80 text-[11px] text-slate-500 text-center bg-slate-900/80">
          Autoguardado activo cada 60 segundos y automáticamente al cerrar o recargar la pestaña.
        </div>
      </div>

      {/* Modal de confirmación para Borrar Aventura (sin window.confirm) */}
      {showWipeConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-60 p-4 select-none animate-fade-in">
          <div className="bg-slate-900 border border-rose-600/80 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-base border-b border-slate-800 pb-3">
              <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white">¿Borrar aventura por completo?</h3>
                <p className="text-[11px] font-normal text-rose-300/80">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                Se eliminarán permanentemente de este navegador y de la nube:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li>Todos los <strong className="text-white">mapas</strong> importados en el tablero y sus archivos en la nube.</li>
                <li>La <strong className="text-white">partida actual</strong> en la nube y en local.</li>
                <li>Toda la <strong className="text-white">niebla de guerra</strong> explorada y revelada.</li>
                <li>La copia de <strong className="text-white">autoguardado</strong>.</li>
              </ul>

              <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/40 rounded text-emerald-300 text-[11px] flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tu biblioteca está a salvo:</strong> Los tokens, objetos, efectos y pistas de música (tanto en local como en la nube) permanecerán intactos.
                </span>
              </div>
            </div>

            {/* Ofrecer antes una copia de seguridad */}
            <div className="p-2.5 bg-slate-800/80 border border-slate-700 rounded flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300">¿Deseas guardar una copia antes?</span>
              <button
                type="button"
                onClick={handleExport}
                className="px-2.5 py-1 bg-sky-950/80 hover:bg-sky-900 border border-sky-600 text-sky-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Descargar archivo .vttsave de respaldo"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Guardar copia</span>
              </button>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowWipeConfirm(false)}
                disabled={isWiping}
                className="px-3.5 py-2 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsWiping(true);
                  try {
                    await clearAdventure();
                    await refreshList();
                    setShowWipeConfirm(false);
                    showStatus('Aventura borrada. La biblioteca de tokens y música se mantiene intacta.');
                  } catch (err) {
                    console.error('Error al borrar aventura:', err);
                    showStatus('Error al borrar aventura: ' + String(err));
                  } finally {
                    setIsWiping(false);
                  }
                }}
                disabled={isWiping}
                className="px-4 py-2 rounded text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-md transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isWiping ? 'Borrando...' : 'Sí, borrar aventura'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
