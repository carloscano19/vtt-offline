import React, { useRef, useState, useEffect } from 'react';
import {
  MousePointer,
  Hand,
  Ruler,
  Upload,
  Grid as GridIcon,
  FolderOpen,
  Save,
  Tv,
  Monitor,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  Layers,
  Settings2,
  BrickWall,
  DoorClosed,
  Cloud,
  CloudOff,
  RotateCcw,
  Scan,
  History,
  Flame,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  CloudRain,
  CloudSnow,
  Wind,
  AlertTriangle,
  ChevronDown,
  PanelRight
} from 'lucide-react';
import { useUIStore, ActiveTool } from '../../../stores/useUIStore';
import { useGameStore } from '../../../stores/useGameStore';
import { parseUVTT } from '../../../modules/import/uvttParser';
import { saveAsset } from '../../../db/dexie';
import { AssetItem, AmbientPreset } from '../../../types/game';
import { Entity } from '../../../types/entity';
import { videoManager } from '../../../modules/media/videoManager';
import { cloudSync } from '../../../modules/sync/cloudSync';

interface TopToolbarProps {
  onOpenGridModal: () => void;
  onOpenRulerModal: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({ onOpenGridModal, onOpenRulerModal }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const activeSidebarTab = useUIStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useUIStore((s) => s.setActiveSidebarTab);
  const showDebugVttOverlay = useUIStore((s) => s.showDebugVttOverlay);
  const setShowDebugVttOverlay = useUIStore((s) => s.setShowDebugVttOverlay);
  const setShowSaveLoadModal = useUIStore((s) => s.setShowSaveLoadModal);
  const setShowDisplaysModal = useUIStore((s) => s.setShowDisplaysModal);
  const isPlayerPreviewMode = useUIStore((s) => s.isPlayerPreviewMode);
  const setIsPlayerPreviewMode = useUIStore((s) => s.setIsPlayerPreviewMode);
  const showPlayerFrame = useUIStore((s) => s.showPlayerFrame);
  const setShowPlayerFrame = useUIStore((s) => s.setShowPlayerFrame);
  const showResetFogConfirm = useUIStore((s) => s.showResetFogConfirm);
  const setShowResetFogConfirm = useUIStore((s) => s.setShowResetFogConfirm);

  const game = useGameStore((s) => s.game);
  const addEntity = useGameStore((s) => s.addEntity);
  const sendMasterCameraToPlayers = useGameStore((s) => s.sendMasterCameraToPlayers);
  const setFollowMasterCamera = useGameStore((s) => s.setFollowMasterCamera);
  const setFogConfig = useGameStore((s) => s.setFogConfig);
  const resetFogExploration = useGameStore((s) => s.resetFogExploration);
  const setAmbientConfig = useGameStore((s) => s.setAmbientConfig);
  const setWeatherConfig = useGameStore((s) => s.setWeatherConfig);
  const undo = useGameStore((s) => s.undo);
  const redo = useGameStore((s) => s.redo);
  const canUndo = useGameStore((s) => s.canUndo());
  const canRedo = useGameStore((s) => s.canRedo());

  const [showFogMenu, setShowFogMenu] = useState(false);
  const [showAmbientMenu, setShowAmbientMenu] = useState(false);
  const [showTvMenu, setShowTvMenu] = useState(false);
  const [videoWarning, setVideoWarning] = useState(videoManager.getActiveVideoCount() > 6);

  const fogMenuRef = useRef<HTMLDivElement>(null);
  const ambientMenuRef = useRef<HTMLDivElement>(null);
  const tvMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (fogMenuRef.current && !fogMenuRef.current.contains(target)) {
        setShowFogMenu(false);
      }
      if (ambientMenuRef.current && !ambientMenuRef.current.contains(target)) {
        setShowAmbientMenu(false);
      }
      if (tvMenuRef.current && !tvMenuRef.current.contains(target)) {
        setShowTvMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return videoManager.onWarningChange((show: boolean) => {
      setVideoWarning(show);
    });
  }, []);

  const handleToolChange = (tool: ActiveTool) => {
    setActiveTool(tool);
    if (tool === 'ruler') {
      onOpenRulerModal();
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name;
      const lowerName = name.toLowerCase();

      try {
        if (lowerName.endsWith('.uvtt') || lowerName.endsWith('.dd2vtt') || lowerName.endsWith('.df2vtt')) {
          // Importar mapa UVTT
          const text = await file.text();
          const parsed = parseUVTT(text);

          const assetId = `map_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const asset: AssetItem = {
            id: assetId,
            name: name.replace(/\.[^/.]+$/, ''),
            type: 'map',
            mimeType: parsed.mimeType,
            blob: parsed.imageBlob,
            createdAt: Date.now(),
            width: parsed.widthPx,
            height: parsed.heightPx
          };

          await saveAsset(asset);

          // Posicionamiento de mapa nuevo:
          // Colocar en el centro de la vista actual del máster
          const currentGridSize = game.grid.size || parsed.pixelsPerGrid || 70;
          const scale = currentGridSize / parsed.pixelsPerGrid;
          const mapW = parsed.widthPx * scale;
          const mapH = parsed.heightPx * scale;

          let mapX = game.masterCamera.x - mapW / 2;
          let mapY = game.masterCamera.y - mapH / 2;

          // Si se solapa con algún mapa existente, desplazar a la derecha del mapa más a la derecha + 2 casillas
          const existingMaps = game.entities.filter((e) => e.type === 'map');
          const isOverlapping = existingMaps.some((m) => {
            const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
            const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY;
            return !(mapX + mapW <= m.x || mapX >= m.x + mW || mapY + mapH <= m.y || mapY >= m.y + mH);
          });

          if (isOverlapping && existingMaps.length > 0) {
            let maxRight = -Infinity;
            let refY = mapY;
            for (const m of existingMaps) {
              const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
              const right = m.x + mW;
              if (right > maxRight) {
                maxRight = right;
                refY = m.y;
              }
            }
            mapX = maxRight + currentGridSize * 2;
            mapY = refY;
          }

          const entity: Entity = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'map',
            name: asset.name,
            assetId: asset.id,
            x: mapX,
            y: mapY,
            rotation: 0,
            scaleX: scale,
            scaleY: scale,
            zIndex: 0,
            visibleToPlayers: true, // Mapas visibles para jugadores por defecto
            locked: false,
            mapData: parsed.mapData
          };

          addEntity(entity);

          // Convertir portales UVTT en entidades de puerta interactivas vinculadas al mapa
          if (parsed.mapData.portals && parsed.mapData.portals.length > 0) {
            for (let pIdx = 0; pIdx < parsed.mapData.portals.length; pIdx++) {
              const portal = parsed.mapData.portals[pIdx];
              if (portal.bounds && portal.bounds.length >= 2) {
                const doorEntity: Entity = {
                  id: `door_${Date.now()}_${pIdx}_${Math.random().toString(36).substring(2, 6)}`,
                  type: 'door',
                  name: `Puerta ${pIdx + 1}`,
                  x: mapX,
                  y: mapY,
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                  zIndex: 40,
                  visibleToPlayers: true,
                  locked: false,
                  mapId: entity.id,
                  door: {
                    isOpen: !portal.closed,
                    isLocked: !!portal.locked,
                    p1: portal.bounds[0],
                    p2: portal.bounds[1],
                    openAngle: Math.PI / 2
                  }
                };
                addEntity(doorEntity);
              }
            }
            parsed.mapData.portals = [];
          }

          // Convertir luces UVTT en entidades de luz interactivas
          if (parsed.mapData.lights && parsed.mapData.lights.length > 0) {
            for (let lIdx = 0; lIdx < parsed.mapData.lights.length; lIdx++) {
              const lgt = parsed.mapData.lights[lIdx];
              const ppg = parsed.mapData.pixelsPerGrid || 70;
              const totalRangeInSquares = Math.max(1, Math.round(lgt.range / ppg));
              const brightRadiusInSquares = Math.max(1, Math.round(totalRangeInSquares * 0.6));
              const dimRadiusInSquares = Math.max(0, totalRangeInSquares - brightRadiusInSquares);

              const lightEntity: Entity = {
                id: `light_${Date.now()}_${lIdx}_${Math.random().toString(36).substring(2, 6)}`,
                type: 'light',
                name: `Luz ${lIdx + 1}`,
                x: mapX + lgt.position.x,
                y: mapY + lgt.position.y,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                zIndex: 45,
                visibleToPlayers: true,
                locked: false,
                mapId: entity.id,
                light: {
                  color: lgt.color || '#ffaa44',
                  intensity: Math.min(100, Math.max(10, Math.round(lgt.intensity * 100))),
                  brightRadiusInSquares,
                  dimRadiusInSquares,
                  edgeHardness: 0.5,
                  flicker: false
                }
              };
              addEntity(lightEntity);
            }
          }
        } else if (
          file.type.includes('audio') ||
          lowerName.endsWith('.mp3') ||
          lowerName.endsWith('.ogg') ||
          lowerName.endsWith('.wav')
        ) {
          // Archivo de audio para música
          const assetId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const asset: AssetItem = {
            id: assetId,
            name: name.replace(/\.[^/.]+$/, ''),
            type: 'audio',
            mimeType: file.type || 'audio/mpeg',
            blob: file,
            createdAt: Date.now()
          };
          await saveAsset(asset);
          cloudSync.enqueueUpload(asset.id);
          useGameStore.getState().addMusicTrack({
            id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: asset.name,
            assetId: asset.id
          });
        } else {
          // Imagen, GIF o Video (Token/Objeto)
          let type: 'image' | 'gif' | 'video' = 'image';
          if (file.type.includes('gif') || lowerName.endsWith('.gif')) {
            type = 'gif';
          } else if (file.type.includes('video') || lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
            type = 'video';
          }

          // Obtener dimensiones reales de la imagen
          let natW = 70;
          let natH = 70;
          try {
            const objUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = objUrl;
            if (typeof img.decode === 'function') {
              await img.decode();
            } else {
              await new Promise<void>((res, rej) => {
                img.onload = () => res();
                img.onerror = rej;
              });
            }
            natW = img.naturalWidth || img.width || 70;
            natH = img.naturalHeight || img.height || 70;
            URL.revokeObjectURL(objUrl);
          } catch {
            // Fallback si falla decode
          }

          const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const asset: AssetItem = {
            id: assetId,
            name: name.replace(/\.[^/.]+$/, ''),
            type,
            mimeType: file.type || 'image/png',
            blob: file,
            createdAt: Date.now(),
            width: natW,
            height: natH
          };

          await saveAsset(asset);
          cloudSync.enqueueUpload(asset.id);

          // Escalar automáticamente para que su lado mayor ocupe exactamente 1 casilla (grid.size)
          const currentGridSize = game.grid.size || 70;
          const maxDim = Math.max(natW, natH);
          const tokenScale = maxDim > 0 ? currentGridSize / maxDim : 1;

          // Centrar en una casilla de la cuadrícula en la vista actual
          const halfGrid = currentGridSize / 2;
          const centeredX = Math.floor(game.masterCamera.x / currentGridSize) * currentGridSize + halfGrid;
          const centeredY = Math.floor(game.masterCamera.y / currentGridSize) * currentGridSize + halfGrid;

          const entity: Entity = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'token',
            name: asset.name,
            assetId: asset.id,
            x: centeredX,
            y: centeredY,
            rotation: 0,
            scaleX: tokenScale,
            scaleY: tokenScale,
            zIndex: 10,
            visibleToPlayers: false, // Tokens ocultos para jugadores por defecto
            locked: false,
            side: 'jugador',
            vision: {
              active: true,
              brightRangeInSquares: 4,
              dimRangeInSquares: 2,
              hardness: 0.5
            },
            statuses: []
          };

          addEntity(entity);
        }
      } catch (err) {
        console.error(`Error al importar archivo ${name}:`, err);
        alert(`Error al importar ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700/80 px-4 flex items-center justify-between text-slate-200 select-none shadow-md z-30">
      {/* Input oculto para importación de archivos */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".uvtt,.dd2vtt,.df2vtt,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Herramientas principales de interacción */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => handleToolChange('select')}
          className={`btn-icon ${activeTool === 'select' ? 'active' : ''}`}
          title="Seleccionar y transformar tokens, mapas u objetos (V)"
        >
          <MousePointer className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('pan')}
          className={`btn-icon ${activeTool === 'pan' ? 'active' : ''}`}
          title="Mover vista / Paneo (H o mantener Espacio y arrastrar)"
        >
          <Hand className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('ruler')}
          className={`btn-icon ${activeTool === 'ruler' ? 'active' : ''}`}
          title="Regla de distancia (M): medir distancias entre puntos"
        >
          <Ruler className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('wall')}
          className={`btn-icon ${activeTool === 'wall' ? 'active' : ''}`}
          title="Pared invisible (W): clic para añadir nodos, doble clic o Enter para terminar, Esc para cancelar"
        >
          <BrickWall className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('door')}
          className={`btn-icon ${activeTool === 'door' ? 'active' : ''}`}
          title="Puerta interactiva (D): haz clic en punto inicial y clic en punto final"
        >
          <DoorClosed className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('light')}
          className={`btn-icon ${activeTool === 'light' ? 'active' : ''}`}
          title="Luz / Antorcha (L): haz clic en el tablero para colocar un punto de luz"
        >
          <Flame className="w-5 h-5 text-amber-400" />
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1" />

        <button
          onClick={onOpenGridModal}
          className="btn-icon text-slate-300 hover:text-white"
          title="Ajustes de cuadrícula (G): tamaño de casilla, color, opacidad, snap y sensibilidad del zoom"
        >
          <GridIcon className="w-5 h-5" />
        </button>

        <button
          onClick={handleImportClick}
          className="btn-icon text-slate-300 hover:text-white"
          title="Importar mapas (.uvtt, .dd2vtt, .df2vtt), tokens, imágenes, GIFs o vídeos"
        >
          <Upload className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowSaveLoadModal(true)}
          className="btn-icon text-slate-300 hover:text-white"
          title="Guardar / Cargar Partida (Cmd/Ctrl+S): guardar en navegador o descargar archivo .vttsave"
        >
          <Save className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1" />

        <button
          onClick={undo}
          disabled={!canUndo}
          className={`btn-icon ${!canUndo ? 'opacity-30 cursor-not-allowed' : 'text-slate-300 hover:text-white'}`}
          title="Deshacer la última acción (Cmd/Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`btn-icon ${!canRedo ? 'opacity-30 cursor-not-allowed' : 'text-slate-300 hover:text-white'}`}
          title="Rehacer la última acción deshecha (Cmd/Ctrl+Y o Cmd+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Controles centrales: 3 Menús desplegables (Niebla, Ambiente, Pantalla TV) */}
      <div className="flex items-center gap-2">
        {/* 1. Menú desplegable "Niebla" */}
        <div className="relative" ref={fogMenuRef}>
          <button
            onClick={() => {
              setShowFogMenu(!showFogMenu);
              setShowAmbientMenu(false);
              setShowTvMenu(false);
            }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
              game.fog.enabled
                ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/70 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Opciones de niebla de guerra: activar, recordar explorado, revelar/ocultar zona, vista de jugadores y reiniciar"
          >
            {game.fog.enabled ? <Cloud className="w-4 h-4 text-indigo-400" /> : <CloudOff className="w-4 h-4 text-slate-400" />}
            <span className="hidden xl:inline">Niebla</span>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>

          {showFogMenu && (
            <div className="absolute top-full mt-1.5 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2.5 z-50 w-60 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1 flex items-center justify-between">
                <span>Niebla de guerra</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${game.fog.enabled ? 'bg-indigo-900 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                  {game.fog.enabled ? 'ACTIVA' : 'OFF'}
                </span>
              </div>

              {/* Activar / Desactivar niebla */}
              <button
                onClick={() => setFogConfig({ enabled: !game.fog.enabled })}
                className={`w-full p-2 rounded flex items-center justify-between border transition-all ${
                  game.fog.enabled
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Activar o desactivar niebla en la pantalla de jugadores"
              >
                <span className="flex items-center gap-2">
                  {game.fog.enabled ? <Cloud className="w-4 h-4 text-indigo-400" /> : <CloudOff className="w-4 h-4 text-slate-400" />}
                  <span>Activar niebla</span>
                </span>
                <span className="font-mono text-xs font-bold">{game.fog.enabled ? 'SÍ' : 'NO'}</span>
              </button>

              {/* Recordar explorado */}
              <button
                onClick={() => setFogConfig({ rememberExplored: !game.fog.rememberExplored })}
                className={`w-full p-2 rounded flex items-center justify-between border transition-all ${
                  game.fog.rememberExplored
                    ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Recordar zonas exploradas: si está activo, las zonas que el token deja de ver se mantienen en gris oscuro. Si está desactivado, vuelven a negro total."
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-400" />
                  <span>Recordar explorado</span>
                </span>
                <span className="font-mono text-xs font-bold">{game.fog.rememberExplored ? 'SÍ' : 'NO'}</span>
              </button>

              <div className="border-t border-slate-800 my-1" />

              {/* Herramientas de Revelar y Ocultar zona */}
              <div className="text-[11px] text-slate-400 font-medium px-0.5">Herramientas de mapa</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    handleToolChange('fogReveal');
                    setShowFogMenu(false);
                  }}
                  className={`p-2 rounded flex items-center justify-center gap-1.5 border transition-all text-xs ${
                    activeTool === 'fogReveal'
                      ? 'bg-amber-600/30 text-amber-300 border-amber-500 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Revelar zona: arrastra un rectángulo en el tablero para descubrir esa área"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Revelar zona</span>
                </button>

                <button
                  onClick={() => {
                    handleToolChange('fogHide');
                    setShowFogMenu(false);
                  }}
                  className={`p-2 rounded flex items-center justify-center gap-1.5 border transition-all text-xs ${
                    activeTool === 'fogHide'
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Ocultar zona: arrastra un rectángulo en el tablero para volver a tapar esa área con niebla"
                >
                  <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Ocultar zona</span>
                </button>
              </div>

              <div className="border-t border-slate-800 my-1" />

              {/* Vista previa de jugadores */}
              <button
                onClick={() => {
                  setIsPlayerPreviewMode(!isPlayerPreviewMode);
                  setShowFogMenu(false);
                }}
                className={`w-full p-2 rounded flex items-center justify-between border transition-all ${
                  isPlayerPreviewMode
                    ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title="Previsualiza exactamente lo que ven los jugadores en su pantalla (con niebla de guerra activa)"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span>Vista jugadores</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isPlayerPreviewMode ? 'bg-purple-900 text-purple-200 font-bold' : 'bg-slate-700 text-slate-400'}`}>
                  {isPlayerPreviewMode ? 'ACTIVA' : 'NORMAL'}
                </span>
              </button>

              {/* Reiniciar niebla */}
              <button
                onClick={() => {
                  setShowResetFogConfirm(true);
                  setShowFogMenu(false);
                }}
                className="w-full p-2 rounded flex items-center gap-2 text-rose-300 hover:text-rose-200 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/60 transition-colors"
                title="Reiniciar niebla: vuelve a oscurecer todo el mapa salvo la visión actual de los tokens"
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>Reiniciar niebla...</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. Menú desplegable "Ambiente" (Luz global y Clima) */}
        <div className="relative" ref={ambientMenuRef}>
          <button
            onClick={() => {
              setShowAmbientMenu(!showAmbientMenu);
              setShowFogMenu(false);
              setShowTvMenu(false);
            }}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 text-amber-300"
            title="Luz ambiental global y efectos de clima"
          >
            {game.ambient.preset === 'dawn' ? (
              <Sunrise className="w-4 h-4 text-amber-400" />
            ) : game.ambient.preset === 'noon' ? (
              <Sun className="w-4 h-4 text-yellow-300" />
            ) : game.ambient.preset === 'dusk' ? (
              <Sunset className="w-4 h-4 text-orange-400" />
            ) : game.ambient.preset === 'night' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-sky-300" />
            )}
            <span className="hidden xl:inline capitalize">
              {game.ambient.preset === 'dawn'
                ? 'Amanecer'
                : game.ambient.preset === 'noon'
                ? 'Mediodía'
                : game.ambient.preset === 'dusk'
                ? 'Atardecer'
                : game.ambient.preset === 'night'
                ? 'Noche'
                : 'Personalizado'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>

          {showAmbientMenu && (
            <div className="absolute top-full mt-1.5 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3 z-50 w-72 space-y-3 text-xs max-h-[85vh] overflow-y-auto">
              <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1">Luz ambiental global</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'dawn', label: 'Amanecer', icon: Sunrise },
                  { id: 'noon', label: 'Mediodía', icon: Sun },
                  { id: 'dusk', label: 'Atardecer', icon: Sunset },
                  { id: 'night', label: 'Noche', icon: Moon }
                ].map((p) => {
                  const Icon = p.icon;
                  const isSelected = game.ambient.preset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setAmbientConfig({ preset: p.id as AmbientPreset });
                      }}
                      className={`p-1.5 rounded flex items-center gap-1.5 border transition-all ${
                        isSelected
                          ? 'bg-sky-950/80 border-sky-500 text-sky-200 shadow-sm'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Personalizado */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Personalizado</span>
                  <input
                    type="color"
                    value={game.ambient.color}
                    onChange={(e) =>
                      setAmbientConfig({
                        preset: 'custom',
                        color: e.target.value
                      })
                    }
                    className="w-6 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Intensidad ({game.ambient.intensity}%)</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={game.ambient.intensity}
                    onChange={(e) =>
                      setAmbientConfig({
                        preset: 'custom',
                        intensity: parseInt(e.target.value) || 0
                      })
                    }
                    className="w-24 accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Clima */}
              <div className="pt-2 border-t border-slate-800">
                <div className="font-semibold text-slate-300 pb-1.5">Efectos climáticos</div>

                {/* Lluvia */}
                <div className="space-y-1.5 pb-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 font-medium text-slate-200 cursor-pointer">
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                      <span>Lluvia</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={game.weather.rain.enabled}
                      onChange={(e) =>
                        setWeatherConfig({
                          rain: { ...game.weather.rain, enabled: e.target.checked }
                        })
                      }
                      className="accent-sky-500 rounded cursor-pointer"
                    />
                  </div>
                  {game.weather.rain.enabled && (
                    <div className="space-y-1 pl-4">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Intensidad</span>
                        <span>{Math.round(game.weather.rain.intensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={game.weather.rain.intensity}
                        onChange={(e) =>
                          setWeatherConfig({
                            rain: { ...game.weather.rain, intensity: parseFloat(e.target.value) }
                          })
                        }
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Dirección ({game.weather.rain.direction}°)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={game.weather.rain.direction}
                        onChange={(e) =>
                          setWeatherConfig({
                            rain: { ...game.weather.rain, direction: parseInt(e.target.value) || 0 }
                          })
                        }
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Nieve */}
                <div className="space-y-1.5 py-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 font-medium text-slate-200 cursor-pointer">
                      <CloudSnow className="w-3.5 h-3.5 text-cyan-200" />
                      <span>Nieve</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={game.weather.snow.enabled}
                      onChange={(e) =>
                        setWeatherConfig({
                          snow: { ...game.weather.snow, enabled: e.target.checked }
                        })
                      }
                      className="accent-sky-500 rounded cursor-pointer"
                    />
                  </div>
                  {game.weather.snow.enabled && (
                    <div className="space-y-1 pl-4">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Intensidad</span>
                        <span>{Math.round(game.weather.snow.intensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={game.weather.snow.intensity}
                        onChange={(e) =>
                          setWeatherConfig({
                            snow: { ...game.weather.snow, intensity: parseFloat(e.target.value) }
                          })
                        }
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Viento */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 font-medium text-slate-200 cursor-pointer">
                      <Wind className="w-3.5 h-3.5 text-amber-300" />
                      <span>Viento</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={game.weather.wind.enabled}
                      onChange={(e) =>
                        setWeatherConfig({
                          wind: { ...game.weather.wind, enabled: e.target.checked }
                        })
                      }
                      className="accent-sky-500 rounded cursor-pointer"
                    />
                  </div>
                  {game.weather.wind.enabled && (
                    <div className="space-y-1 pl-4">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Intensidad</span>
                        <span>{Math.round(game.weather.wind.intensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={game.weather.wind.intensity}
                        onChange={(e) =>
                          setWeatherConfig({
                            wind: { ...game.weather.wind, intensity: parseFloat(e.target.value) }
                          })
                        }
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Dirección ({game.weather.wind.direction}°)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={game.weather.wind.direction}
                        onChange={(e) =>
                          setWeatherConfig({
                            wind: { ...game.weather.wind, direction: parseInt(e.target.value) || 0 }
                          })
                        }
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Menú desplegable "Pantalla TV" */}
        <div className="relative" ref={tvMenuRef}>
          <button
            onClick={() => {
              setShowTvMenu(!showTvMenu);
              setShowFogMenu(false);
              setShowAmbientMenu(false);
            }}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 text-emerald-400"
            title="Opciones de pantalla de jugadores / TV"
          >
            <Tv className="w-4 h-4 text-emerald-400" />
            <span className="hidden xl:inline">Pantalla TV</span>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>

          {showTvMenu && (
            <div className="absolute top-full mt-1.5 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2.5 z-50 w-64 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1">
                Pantalla de jugadores (TV)
              </div>

              <button
                onClick={() => {
                  setShowDisplaysModal(true);
                  setShowTvMenu(false);
                }}
                className="w-full p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center gap-2 text-slate-200 transition-colors"
                title="Abrir o gestionar la pantalla de jugadores para monitor o TV"
              >
                <Monitor className="w-4 h-4 text-emerald-400" />
                <span className="font-medium">Abrir pantalla TV...</span>
              </button>

              <button
                onClick={() => setShowPlayerFrame(!showPlayerFrame)}
                className={`w-full p-2 rounded flex items-center justify-between border transition-all ${
                  showPlayerFrame
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar u ocultar en el tablero el marco verde discontinuo que representa la pantalla de los jugadores (TV)"
              >
                <span className="flex items-center gap-2">
                  <Scan className="w-4 h-4 text-emerald-400" />
                  <span>Marco TV en tablero</span>
                </span>
                <span className="font-mono text-xs font-bold">{showPlayerFrame ? 'SÍ' : 'NO'}</span>
              </button>

              <button
                onClick={() => {
                  sendMasterCameraToPlayers();
                  setShowTvMenu(false);
                }}
                className="w-full p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center gap-2 text-sky-300 transition-colors"
                title="Alinea la posición y zoom de la pantalla de jugadores con la tuya"
              >
                <Tv className="w-4 h-4 text-sky-400" />
                <span>Enviar vista a jugadores</span>
              </button>

              <button
                onClick={() => setFollowMasterCamera(!game.followMasterCamera)}
                className={`w-full p-2 rounded flex items-center justify-between border transition-all ${
                  game.followMasterCamera
                    ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Cuando está activo, cualquier movimiento o zoom de tu cámara se refleja instantáneamente en la pantalla de jugadores"
              >
                <span className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-sky-400" />
                  <span>Seguir mi cámara</span>
                </span>
                <span className="font-mono text-xs font-bold">{game.followMasterCamera ? 'SÍ' : 'NO'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Controles de la derecha: aviso de vídeos, depuración UVTT y botón del panel lateral */}
      <div className="flex items-center gap-2">
        {videoWarning && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/80 border border-amber-500/80 text-amber-300 rounded text-xs animate-pulse"
            title="Hay más de 6 vídeos activos simultáneamente. Podría afectar al rendimiento."
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">&gt;6 vídeos</span>
          </div>
        )}

        <button
          onClick={() => setShowDebugVttOverlay(!showDebugVttOverlay)}
          className={`btn-icon ${showDebugVttOverlay ? 'text-sky-400' : 'text-slate-500'}`}
          title={showDebugVttOverlay ? 'Paredes y luces UVTT visibles en máster' : 'Paredes y luces UVTT ocultas'}
        >
          {showDebugVttOverlay ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span className="hidden xl:inline text-xs ml-1 font-mono">UVTT</span>
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1" />

        <button
          onClick={() => setActiveSidebarTab(activeSidebarTab ? null : 'properties')}
          className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
            activeSidebarTab
              ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
          title={activeSidebarTab ? 'Ocultar panel lateral' : 'Mostrar panel lateral (Propiedades, Capas, Biblioteca, Música)'}
        >
          <PanelRight className="w-4 h-4" />
          <span className="hidden xl:inline">{activeSidebarTab ? 'Ocultar panel' : 'Panel lateral'}</span>
        </button>
      </div>

      {/* Modal de confirmación para reiniciar niebla (sin window.confirm) */}
      {showResetFogConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-sm w-full shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
              <RotateCcw className="w-5 h-5" />
              <span>Reiniciar Niebla de Guerra</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              ¿Estás seguro de que deseas reiniciar la exploración de la niebla? Todas las zonas previamente descubiertas volverán a quedar en completa oscuridad para los jugadores.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowResetFogConfirm(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  resetFogExploration();
                  setShowResetFogConfirm(false);
                }}
                className="px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-500 shadow transition-colors"
              >
                Sí, reiniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
