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
import {
  listCloudSavedGames,
  saveGameToCloudSaved,
  loadGameFromCloudSaved,
  deleteCloudSavedGame,
  getLastUsedOwner,
  setLastUsedOwner,
  CloudSavedGameSummary
} from '../../../modules/persistence/cloudSavedGames';
import { authManager } from '../../../modules/auth/authManager';
import { isSupabaseConfigured } from '../../../modules/supabase/supabaseClient';
import { StoredGame } from '../../../db/dexie';
import {
  X,
  Save,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Clock,
  Check,
  Copy,
  AlertCircle,
  AlertTriangle,
  Lock,
  Cloud,
  CloudUpload,
  User,
  KeyRound,
  DoorClosed
} from 'lucide-react';

export const SaveLoadModal: React.FC = () => {
  const showSaveLoadModal = useUIStore((s) => s.showSaveLoadModal);
  const setShowSaveLoadModal = useUIStore((s) => s.setShowSaveLoadModal);
  const setShowAuthModal = useUIStore((s) => s.setShowAuthModal);

  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);

  const [savedGames, setSavedGames] = useState<StoredGame[]>([]);
  const [cloudGames, setCloudGames] = useState<CloudSavedGameSummary[]>([]);
  const [gameName, setGameName] = useState(game.name || 'Nueva Partida');
  const [cloudOwner, setCloudOwner] = useState(getLastUsedOwner());
  const [cloudPin, setCloudPin] = useState('');
  const [isSavingAsNew, setIsSavingAsNew] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const duplicateInputRef = useRef<HTMLInputElement>(null);

  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // Modal para pedir PIN al abrir o borrar una partida de la nube
  const [pinPrompt, setPinPrompt] = useState<{
    mode: 'open' | 'delete';
    gameId: string;
    gameName: string;
    pin: string;
    error: string | null;
  } | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Modal para subir una partida local de este navegador a la nube
  const [uploadLocalModal, setUploadLocalModal] = useState<{
    localGame: StoredGame;
    name: string;
    owner: string;
    pin: string;
    isUploading: boolean;
    error: string | null;
  } | null>(null);

  // Modal para advertir de cambios sin guardar antes de cerrar tablero o cambiar de partida
  const [unsavedPrompt, setUnsavedPrompt] = useState<{
    action: 'closeBoard' | 'loadCloud' | 'loadLocal';
    targetCloudId?: string;
    targetLocalId?: string;
    targetGameSummary?: CloudSavedGameSummary;
  } | null>(null);

  const isCloudConnected = Boolean(isSupabaseConfigured() && authManager.isAuthenticated());
  const isCurrentGameFromCloud = Boolean(game.cloudSavedId);

  const refreshList = async () => {
    const list = await listSavedGames();
    setSavedGames(list);
  };

  const refreshCloudList = async () => {
    if (!isCloudConnected) {
      setCloudGames([]);
      return;
    }
    const list = await listCloudSavedGames();
    setCloudGames(list);
  };

  useEffect(() => {
    if (showSaveLoadModal) {
      setGameName(game.name || 'Nueva Partida');
      setCloudOwner(game.cloudSavedOwner || getLastUsedOwner());
      setCloudPin('');
      setIsSavingAsNew(false);
      setIsDuplicating(false);
      setDuplicateName('');
      setPinPrompt(null);
      setUploadLocalModal(null);
      setUnsavedPrompt(null);
      refreshList();
      refreshCloudList();
    }
  }, [showSaveLoadModal, game.id, game.name, game.cloudSavedId, isCloudConnected]);

  useEffect(() => {
    if (isDuplicating) {
      duplicateInputRef.current?.focus();
      duplicateInputRef.current?.select();
    }
  }, [isDuplicating]);

  useEffect(() => {
    if (pinPrompt) {
      pinInputRef.current?.focus();
    }
  }, [pinPrompt]);

  if (!showSaveLoadModal) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // 1. Guardar cambios en la nube sobre la partida actual
  const handleSaveCloudChanges = async () => {
    if (!game.cloudSavedId) return;
    const trimmed = gameName.trim() || game.cloudSavedName || 'Aventura';
    const ownerToSave = cloudOwner.trim() || game.cloudSavedOwner || 'Carlos';
    setLastUsedOwner(ownerToSave);

    const updated = {
      ...game,
      name: trimmed,
      cloudSavedName: trimmed,
      cloudSavedOwner: ownerToSave,
      updatedAt: Date.now()
    };
    setGame(updated);

    const res = await saveGameToCloudSaved({
      id: game.cloudSavedId,
      name: trimmed,
      owner: ownerToSave,
      game: updated
    });

    if (res.success) {
      await cloudGameSync.saveImmediate(updated);
      await refreshCloudList();
      showStatus(`¡Cambios guardados en la nube para "${trimmed}"!`);
    } else {
      showStatus(`Error al guardar en la nube: ${res.error || 'Desconocido'}`);
    }
  };

  // 2. Guardar como nueva partida en la nube
  const handleSaveNewToCloud = async () => {
    const trimmed = gameName.trim() || 'Nueva Partida';
    const ownerToSave = cloudOwner.trim() || 'Carlos';
    setLastUsedOwner(ownerToSave);

    if (cloudPin.trim() && !/^\d{4}$/.test(cloudPin.trim())) {
      showStatus('El PIN debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    const res = await saveGameToCloudSaved({
      name: trimmed,
      owner: ownerToSave,
      pin: cloudPin.trim() || null,
      game: { ...game, name: trimmed }
    });

    if (res.success) {
      const updated = {
        ...game,
        name: trimmed,
        cloudSavedId: res.id,
        cloudSavedName: trimmed,
        cloudSavedOwner: ownerToSave,
        updatedAt: Date.now()
      };
      setGame(updated);
      await cloudGameSync.saveImmediate(updated);
      setCloudPin('');
      setIsSavingAsNew(false);
      await refreshCloudList();
      showStatus(`¡Partida guardada en la nube como "${trimmed}"!`);
    } else {
      showStatus(`Error al guardar en la nube: ${res.error || 'Desconocido'}`);
    }
  };

  // 3. Comprobar cambios sin guardar antes de cerrar tablero o cambiar de partida
  const checkUnsavedBeforeAction = (
    action: 'closeBoard' | 'loadCloud' | 'loadLocal',
    targetCloudId?: string,
    targetLocalId?: string,
    targetGameSummary?: CloudSavedGameSummary
  ): boolean => {
    const hasEntities = game.entities && game.entities.length > 0;

    // Si la partida actual no proviene de la nube y tiene entidades colocadas en el tablero:
    if (hasEntities && !game.cloudSavedId) {
      setUnsavedPrompt({
        action,
        targetCloudId,
        targetLocalId,
        targetGameSummary
      });
      return false; // Espera confirmación del usuario
    }

    return true; // Puede continuar directamente
  };

  // 4. Cerrar tablero (deja el tablero limpio en Atardecer)
  const executeCloseBoard = async () => {
    if (game.cloudSavedId) {
      await cloudGameSync.flushAndFinalizeActiveCloudGame();
    }
    await cloudGameSync.closeBoard();
    setShowSaveLoadModal(false);
    showStatus('Tablero cerrado. Partida limpia en Atardecer.');
  };

  const handleCloseBoardClick = () => {
    if (checkUnsavedBeforeAction('closeBoard')) {
      executeCloseBoard();
    }
  };

  // 5. Abrir partida de la nube
  const executeOpenCloudGame = async (summary: CloudSavedGameSummary, pin?: string) => {
    await cloudGameSync.flushAndFinalizeActiveCloudGame();

    const res = await loadGameFromCloudSaved(summary.id, pin);
    if (!res.success) {
      if (res.error === 'PIN incorrecto') {
        if (pinPrompt) {
          setPinPrompt({ ...pinPrompt, error: 'PIN incorrecto. Inténtalo de nuevo.' });
        } else {
          showStatus('PIN incorrecto');
        }
      } else {
        showStatus(res.error || 'Error al cargar la partida');
        setPinPrompt(null);
      }
      return;
    }

    if (res.game) {
      setGame(res.game);
      setGameName(res.game.name);
      await cloudGameSync.saveImmediate(res.game);
      setPinPrompt(null);
      setShowSaveLoadModal(false);
      showStatus(`Partida "${res.game.name}" cargada desde la nube.`);
    }
  };

  const handleOpenCloudGameClick = (summary: CloudSavedGameSummary) => {
    if (!checkUnsavedBeforeAction('loadCloud', summary.id, undefined, summary)) {
      return;
    }

    if (summary.hasPin) {
      setPinPrompt({
        mode: 'open',
        gameId: summary.id,
        gameName: summary.name,
        pin: '',
        error: null
      });
    } else {
      executeOpenCloudGame(summary);
    }
  };

  // 6. Borrar partida de la nube
  const executeDeleteCloudGame = async (gameId: string, pin?: string) => {
    const res = await deleteCloudSavedGame(gameId, pin);
    if (!res.success) {
      if (res.error === 'PIN incorrecto' && pinPrompt) {
        setPinPrompt({ ...pinPrompt, error: 'PIN incorrecto. Inténtalo de nuevo.' });
      } else {
        showStatus(res.error || 'Error al eliminar');
        setPinPrompt(null);
      }
      return;
    }

    setPinPrompt(null);
    await refreshCloudList();
    showStatus('Partida eliminada de la nube.');
  };

  const handleDeleteCloudGameClick = (summary: CloudSavedGameSummary) => {
    if (summary.hasPin) {
      setPinPrompt({
        mode: 'delete',
        gameId: summary.id,
        gameName: summary.name,
        pin: '',
        error: null
      });
    } else {
      if (confirm(`¿Estás seguro de eliminar permanentemente la partida "${summary.name}" de la nube?`)) {
        executeDeleteCloudGame(summary.id);
      }
    }
  };

  // 7. Subir partida local a la nube
  const handleStartUploadLocal = (localGame: StoredGame) => {
    setUploadLocalModal({
      localGame,
      name: localGame.name,
      owner: getLastUsedOwner(),
      pin: '',
      isUploading: false,
      error: null
    });
  };

  const handleConfirmUploadLocal = async () => {
    if (!uploadLocalModal) return;
    const { localGame, name, owner, pin } = uploadLocalModal;
    const trimmedName = name.trim() || localGame.name;
    const trimmedOwner = owner.trim() || 'Carlos';

    if (pin.trim() && !/^\d{4}$/.test(pin.trim())) {
      setUploadLocalModal({ ...uploadLocalModal, error: 'El PIN debe ser de 4 dígitos' });
      return;
    }

    setUploadLocalModal({ ...uploadLocalModal, isUploading: true, error: null });

    const res = await saveGameToCloudSaved({
      name: trimmedName,
      owner: trimmedOwner,
      pin: pin.trim() || null,
      game: localGame.data
    });

    if (res.success) {
      setUploadLocalModal(null);
      await refreshCloudList();
      showStatus(`Partida "${trimmedName}" subida a la nube con éxito.`);
    } else {
      setUploadLocalModal({
        ...uploadLocalModal,
        isUploading: false,
        error: res.error || 'Error al subir a la nube'
      });
    }
  };

  // 8. Cargar partida local (Dexie)
  const executeOpenLocalGame = async (id: string) => {
    await cloudGameSync.flushAndFinalizeActiveCloudGame();
    const loaded = await loadGameFromDb(id);
    if (loaded) {
      setGame(loaded);
      setGameName(loaded.name);
      await cloudGameSync.saveImmediate(loaded);
      setShowSaveLoadModal(false);
      showStatus(`Partida local "${loaded.name}" cargada.`);
    }
  };

  const handleOpenLocalGameClick = (id: string) => {
    if (checkUnsavedBeforeAction('loadLocal', undefined, id)) {
      executeOpenLocalGame(id);
    }
  };

  // 9. Guardar partida en este navegador (local)
  const handleSaveLocal = async () => {
    const updated = { ...game, name: gameName, updatedAt: Date.now() };
    await saveGameToDb(updated);
    setGame(updated);
    await refreshList();
    showStatus('Partida guardada en este navegador.');
  };

  // 10. Eliminar partida local
  const handleDeleteLocal = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de eliminar la partida local "${name}"?`)) {
      await deleteSavedGame(id);
      await refreshList();
      showStatus('Partida local eliminada.');
    }
  };

  // 11. Duplicar partida local
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

  // 12. Cargar último autoguardado local
  const handleLoadAutoSave = async () => {
    const auto = await loadAutoSaveFromDb();
    if (auto) {
      if (confirm('¿Restaurar el último autoguardado?')) {
        await cloudGameSync.flushAndFinalizeActiveCloudGame();
        setGame(auto);
        setGameName(auto.name);
        await cloudGameSync.saveImmediate(auto);
        setShowSaveLoadModal(false);
      }
    } else {
      alert('No hay ningún autoguardado previo registrado.');
    }
  };

  // 13. Exportar e importar archivos .vttsave
  const handleExport = async () => {
    try {
      showStatus('Generando archivo .vttsave...');
      const zipBlob = await exportVttSave(game);
      const suggestedFileName = `${(game.name || 'partida').replace(/[/\\?%*:|"<>]/g, '_')}.vttsave`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: suggestedFileName,
            types: [{ description: 'VTT Save File', accept: { 'application/zip': ['.vttsave'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(zipBlob);
          await writable.close();
          showStatus('¡Archivo guardado con éxito!');
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedFileName;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('¡Archivo .vttsave descargado!');
    } catch (err) {
      console.error('Error al guardar en archivo:', err);
      alert('Error al guardar en archivo: ' + String(err));
    }
  };

  const handleImportClick = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'VTT Save File', accept: { 'application/zip': ['.vttsave'] } }],
          multiple: false
        });
        const file = await fileHandle.getFile();
        await processImportFile(file);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
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
      cloudGameSync.saveImmediate(importedGame);
      cloudSync.processQueue();
      showStatus('¡Partida importada y sincronizada!');
      setShowSaveLoadModal(false);
    } catch (err) {
      console.error('Error al importar:', err);
      alert('Error al abrir archivo de partida: ' + String(err));
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

      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[580px] max-w-[95vw] max-h-[88vh] flex flex-col text-slate-200">
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Save className="w-5 h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-sm text-white truncate">Gestor de Partidas</h3>
            {game.cloudSavedName && (
              <span className="ml-2 px-2 py-0.5 bg-sky-950/80 border border-sky-500/40 rounded-full text-[11px] text-sky-300 font-medium truncate flex items-center gap-1">
                <Cloud className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate">{game.cloudSavedName}</span>
                {game.cloudSavedOwner && (
                  <span className="text-slate-400 font-normal">({game.cloudSavedOwner})</span>
                )}
              </span>
            )}
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
          {/* SECCIÓN 1: PARTIDAS EN LA NUBE (Carlos y Juanma) */}
          <div className="p-3 bg-slate-800/80 border border-sky-600/40 rounded-lg space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Partidas en la nube</span>
              </div>
              {!isCloudConnected ? (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-medium flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Conectar con clave de la mesa</span>
                </button>
              ) : (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Conectado a la nube
                </span>
              )}
            </div>

            {isCloudConnected ? (
              <div className="space-y-3">
                {/* Formulario de guardado en la nube */}
                <div className="space-y-2 bg-slate-900/60 p-2.5 rounded border border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-300 font-medium">
                      {isCurrentGameFromCloud && !isSavingAsNew
                        ? 'Partida activa en la nube'
                        : 'Guardar partida actual en la nube'}
                    </label>
                    {isCurrentGameFromCloud && (
                      <button
                        type="button"
                        onClick={() => setIsSavingAsNew(!isSavingAsNew)}
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                      >
                        {isSavingAsNew ? 'Volver a actualizar activa' : 'Guardar como nueva...'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <input
                        type="text"
                        value={gameName}
                        onChange={(e) => setGameName(e.target.value)}
                        placeholder="Nombre de la partida"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={cloudOwner}
                        onChange={(e) => setCloudOwner(e.target.value)}
                        placeholder="Dueño (ej: Carlos)"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                        title="Nombre del máster (se recordará automáticamente)"
                      />
                    </div>
                    {(!isCurrentGameFromCloud || isSavingAsNew) ? (
                      <div className="col-span-3">
                        <input
                          type="password"
                          maxLength={4}
                          value={cloudPin}
                          onChange={(e) => setCloudPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="PIN 4 dígitos"
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 text-center font-mono"
                          title="PIN opcional de 4 dígitos para proteger la partida"
                        />
                      </div>
                    ) : (
                      <div className="col-span-3">
                        <button
                          onClick={handleSaveCloudChanges}
                          className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center justify-center gap-1.5 transition-colors"
                          title="Actualiza los cambios de la partida en su fila de la nube"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Guardar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {(!isCurrentGameFromCloud || isSavingAsNew) && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleSaveNewToCloud}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>Guardar en la nube</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Lista de partidas en la nube */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    Partidas disponibles en la nube:
                  </span>
                  {cloudGames.length === 0 ? (
                    <div className="p-3 text-center text-slate-500 bg-slate-900/40 rounded border border-slate-800">
                      No hay ninguna partida guardada en la nube todavía.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {cloudGames.map((item) => {
                        const dateStr = new Date(item.updatedAt).toLocaleString();
                        const isCurrent = item.id === game.cloudSavedId;

                        return (
                          <div
                            key={item.id}
                            className={`p-2 rounded border flex items-center justify-between gap-3 ${
                              isCurrent
                                ? 'bg-sky-950/60 border-sky-500/80 shadow-xs'
                                : 'bg-slate-900/70 border-slate-700/70'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white truncate text-xs">
                                  {item.name}
                                </span>
                                {item.hasPin && (
                                  <span title="Protegida con PIN">
                                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 text-[9px] bg-sky-900 text-sky-300 rounded font-bold uppercase">
                                    Abierta
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <User className="w-3 h-3 text-sky-400/80" />
                                <span className="text-slate-300">{item.owner}</span>
                                <span className="text-slate-600">•</span>
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{dateStr}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenCloudGameClick(item)}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium text-xs transition-colors flex items-center gap-1"
                                title={item.hasPin ? 'Requiere PIN de 4 dígitos para abrir' : 'Cargar partida en el tablero'}
                              >
                                {item.hasPin && <Lock className="w-3 h-3" />}
                                <span>Abrir</span>
                              </button>
                              <button
                                onClick={() => handleDeleteCloudGameClick(item)}
                                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                title="Eliminar partida de la nube"
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
            ) : (
              <div className="p-3 bg-slate-900/50 rounded border border-slate-800 text-[11px] text-slate-400">
                Inicia sesión con la clave de la mesa para guardar tus partidas en la nube, compartirlas entre másters y asegurarlas con PIN de 4 dígitos.
              </div>
            )}
          </div>

          {/* ACCIONES DEL TABLERO: Cerrar tablero, Guardar local, Nueva, Archivos */}
          <div className="space-y-1.5 pt-1 border-t border-slate-700/80">
            <span className="text-slate-400 font-medium block">Acciones del tablero</span>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={handleCloseBoardClick}
                className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded flex flex-col items-center gap-1 text-slate-300 hover:text-rose-300 transition-colors"
                title="Deja el tablero completamente vacío (partida nueva en Atardecer) sin tocar la biblioteca ni las partidas guardadas"
              >
                <DoorClosed className="w-4 h-4 text-rose-400" />
                <span className="text-[11px]">Cerrar tablero</span>
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
                title="Restaurar copia de seguridad automática local"
              >
                <RotateCcw className="w-4 h-4 text-purple-400" />
                <span className="text-[11px]">Autoguardado</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 2: PARTIDAS GUARDADAS EN ESTE NAVEGADOR (Local Dexie) */}
          <div className="space-y-2 pt-2 border-t border-slate-700/80">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium block">Partidas guardadas en este navegador</span>
              <div className="flex gap-1.5">
                <button
                  onClick={handleSaveLocal}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] text-slate-300 hover:text-white flex items-center gap-1"
                  title="Guardar copia local en este navegador"
                >
                  <Save className="w-3 h-3 text-sky-400" />
                  <span>Guardar local</span>
                </button>
                <button
                  onClick={startDuplicate}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] text-slate-300 hover:text-white flex items-center gap-1"
                  title="Duplicar partida local"
                >
                  <Copy className="w-3 h-3 text-sky-400" />
                  <span>Duplicar</span>
                </button>
              </div>
            </div>

            {/* Aviso explícito de almacenamiento local */}
            <div className="p-2 bg-amber-950/20 border border-amber-600/40 rounded flex items-center gap-2 text-[11px] text-amber-200/90">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Estas partidas solo residen en este navegador. Usa <strong>"Subir a la nube"</strong> para compartirlas o <strong>"Guardar en archivo..."</strong> para hacer copias de seguridad.
              </span>
            </div>

            {/* Campo desplegable para Duplicar partida local */}
            {isDuplicating && (
              <div className="p-2.5 bg-slate-800/90 border border-sky-500/60 rounded-md space-y-2 shadow-inner">
                <label className="text-[11px] text-sky-300 font-medium block">
                  Nombre para la copia local de la partida:
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
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar</span>
                  </button>
                  <button
                    onClick={cancelDuplicate}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded font-medium flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </button>
                </div>
              </div>
            )}

            {savedGames.length === 0 ? (
              <div className="p-3 text-center text-slate-500 bg-slate-800/40 rounded border border-slate-800">
                Aún no has guardado ninguna partida local en este navegador.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {savedGames.map((item) => {
                  const dateStr = new Date(item.updatedAt).toLocaleString();
                  const isCurrent = item.id === game.id;

                  return (
                    <div
                      key={item.id}
                      className={`p-2 rounded border flex items-center justify-between gap-3 ${
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
                          onClick={() => handleOpenLocalGameClick(item.id)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium text-xs transition-colors"
                        >
                          Cargar
                        </button>
                        {isCloudConnected && (
                          <button
                            onClick={() => handleStartUploadLocal(item)}
                            className="px-2 py-1 bg-sky-900/60 hover:bg-sky-800 border border-sky-600/50 text-sky-200 rounded font-medium text-xs transition-colors flex items-center gap-1"
                            title="Subir esta partida a la nube"
                          >
                            <CloudUpload className="w-3.5 h-3.5 text-sky-400" />
                            <span>Subir a la nube</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteLocal(item.id, item.name)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Eliminar partida local"
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
          Autoguardado dual activo: actualiza la partida en la nube y la pantalla de la tele en tiempo real.
        </div>
      </div>

      {/* Modal para introducir PIN (Abrir o Borrar) */}
      {pinPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-60 p-4 select-none animate-fade-in">
          <div className="bg-slate-900 border border-amber-500/80 rounded-xl p-5 max-w-sm w-full shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm border-b border-slate-800 pb-2.5">
              <Lock className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <h4 className="text-white truncate">
                  {pinPrompt.mode === 'open' ? 'Partida protegida con PIN' : 'Confirmar borrado con PIN'}
                </h4>
                <p className="text-[11px] font-normal text-slate-400 truncate">
                  "{pinPrompt.gameName}"
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              {pinPrompt.mode === 'open'
                ? 'Introduce el PIN de 4 dígitos para cargar esta partida en el tablero:'
                : 'Esta partida está protegida. Introduce su PIN de 4 dígitos para autorizar el borrado:'}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinPrompt.pin.trim().length !== 4) {
                  setPinPrompt({ ...pinPrompt, error: 'El PIN debe ser de 4 dígitos' });
                  return;
                }
                if (pinPrompt.mode === 'open') {
                  const targetSummary = cloudGames.find((g) => g.id === pinPrompt.gameId);
                  if (targetSummary) {
                    executeOpenCloudGame(targetSummary, pinPrompt.pin.trim());
                  }
                } else {
                  executeDeleteCloudGame(pinPrompt.gameId, pinPrompt.pin.trim());
                }
              }}
              className="space-y-3"
            >
              <input
                ref={pinInputRef}
                type="password"
                maxLength={4}
                value={pinPrompt.pin}
                onChange={(e) =>
                  setPinPrompt({
                    ...pinPrompt,
                    pin: e.target.value.replace(/\D/g, ''),
                    error: null
                  })
                }
                placeholder="PIN (4 dígitos)"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-center text-lg tracking-widest text-white focus:outline-none focus:border-amber-400 font-mono"
              />

              {pinPrompt.error && (
                <div className="text-[11px] text-rose-400 font-medium text-center">
                  {pinPrompt.error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPinPrompt(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded text-xs font-bold text-white transition-colors ${
                    pinPrompt.mode === 'open'
                      ? 'bg-sky-600 hover:bg-sky-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {pinPrompt.mode === 'open' ? 'Abrir partida' : 'Borrar partida'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para subir una partida local a la nube */}
      {uploadLocalModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-60 p-4 select-none animate-fade-in">
          <div className="bg-slate-900 border border-sky-500/80 rounded-xl p-5 max-w-md w-full shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-sky-400 font-bold text-sm border-b border-slate-800 pb-2.5">
              <CloudUpload className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="text-white">Subir partida local a la nube</h4>
                <p className="text-[11px] font-normal text-slate-400">
                  Estará disponible para Carlos y Juanma en cualquier momento
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nombre en la nube:</label>
                <input
                  type="text"
                  value={uploadLocalModal.name}
                  onChange={(e) =>
                    setUploadLocalModal({ ...uploadLocalModal, name: e.target.value })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Dueño:</label>
                <input
                  type="text"
                  value={uploadLocalModal.owner}
                  onChange={(e) =>
                    setUploadLocalModal({ ...uploadLocalModal, owner: e.target.value })
                  }
                  placeholder="Carlos o Juanma"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  PIN de 4 dígitos (opcional):
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={uploadLocalModal.pin}
                  onChange={(e) =>
                    setUploadLocalModal({
                      ...uploadLocalModal,
                      pin: e.target.value.replace(/\D/g, '')
                    })
                  }
                  placeholder="Opcional (4 dígitos)"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 text-center tracking-widest font-mono"
                />
              </div>

              {uploadLocalModal.error && (
                <div className="text-[11px] text-rose-400 font-medium">
                  {uploadLocalModal.error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setUploadLocalModal(null)}
                disabled={uploadLocalModal.isUploading}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmUploadLocal}
                disabled={uploadLocalModal.isUploading}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-xs flex items-center gap-1.5 transition-colors"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{uploadLocalModal.isUploading ? 'Subiendo...' : 'Subir a la nube'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para advertir de cambios sin guardar antes de cerrar tablero o abrir otra partida */}
      {unsavedPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-60 p-4 select-none animate-fade-in">
          <div className="bg-slate-900 border border-amber-500/80 rounded-xl p-5 max-w-md w-full shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm border-b border-slate-800 pb-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="text-white">Cambios sin guardar en la nube</h4>
                <p className="text-[11px] font-normal text-slate-400">
                  La partida actual en el tablero no está guardada en la nube
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              El tablero contiene elementos que se perderán si no los guardas en la nube antes de continuar.
              ¿Qué deseas hacer?
            </p>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setUnsavedPrompt(null);
                  setIsSavingAsNew(true);
                  showStatus('Indica un nombre y dueño para guardar la partida en la nube.');
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Guardar en la nube antes de continuar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const p = unsavedPrompt;
                  setUnsavedPrompt(null);
                  if (p.action === 'closeBoard') {
                    executeCloseBoard();
                  } else if (p.action === 'loadCloud' && p.targetGameSummary) {
                    if (p.targetGameSummary.hasPin) {
                      setPinPrompt({
                        mode: 'open',
                        gameId: p.targetGameSummary.id,
                        gameName: p.targetGameSummary.name,
                        pin: '',
                        error: null
                      });
                    } else {
                      executeOpenCloudGame(p.targetGameSummary);
                    }
                  } else if (p.action === 'loadLocal' && p.targetLocalId) {
                    executeOpenLocalGame(p.targetLocalId);
                  }
                }}
                className="w-full py-2 bg-slate-800 hover:bg-rose-900/60 border border-slate-700 hover:border-rose-600 text-slate-300 hover:text-white rounded text-xs transition-colors"
              >
                Descartar cambios actuales y continuar
              </button>

              <button
                type="button"
                onClick={() => setUnsavedPrompt(null)}
                className="w-full py-1.5 text-slate-400 hover:text-white text-xs text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
              <p>Se eliminarán permanentemente de este navegador y de la nube:</p>
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
                    await refreshCloudList();
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
