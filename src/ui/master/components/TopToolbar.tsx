import React, { useRef, useState } from 'react';
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
  Sun,
  Moon
} from 'lucide-react';
import { useUIStore, ActiveTool } from '../../../stores/useUIStore';
import { useGameStore } from '../../../stores/useGameStore';
import { parseUVTT } from '../../../modules/import/uvttParser';
import { saveAsset } from '../../../db/dexie';
import { AssetItem } from '../../../types/game';
import { Entity } from '../../../types/entity';

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
  const undo = useGameStore((s) => s.undo);
  const redo = useGameStore((s) => s.redo);
  const canUndo = useGameStore((s) => s.canUndo());
  const canRedo = useGameStore((s) => s.canRedo());

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
              rangeInSquares: 12,
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
          title="Seleccionar y mover entidades (V)"
        >
          <MousePointer className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('pan')}
          className={`btn-icon ${activeTool === 'pan' ? 'active' : ''}`}
          title="Mover cámara / Paneo (H o Espacio + arrastrar)"
        >
          <Hand className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('ruler')}
          className={`btn-icon ${activeTool === 'ruler' ? 'active' : ''}`}
          title="Regla de distancia (M)"
        >
          <Ruler className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('wall')}
          className={`btn-icon ${activeTool === 'wall' ? 'active' : ''}`}
          title="Pared invisible (W) - Clic para añadir nodos, Doble clic o Enter para terminar, Esc para cancelar"
        >
          <BrickWall className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleToolChange('door')}
          className={`btn-icon ${activeTool === 'door' ? 'active' : ''}`}
          title="Puerta (D) - Clic punto inicial y clic punto final"
        >
          <DoorClosed className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1" />

        <button
          onClick={() => handleToolChange('fogReveal')}
          className={`btn-icon ${activeTool === 'fogReveal' ? 'active text-amber-400' : 'text-slate-400 hover:text-white'}`}
          title="Revelar zona de niebla (arrastrar rectángulo)"
        >
          <Sun className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleToolChange('fogHide')}
          className={`btn-icon ${activeTool === 'fogHide' ? 'active text-indigo-400' : 'text-slate-400 hover:text-white'}`}
          title="Ocultar zona de niebla (arrastrar rectángulo)"
        >
          <Moon className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1.5" />

        <button
          onClick={onOpenGridModal}
          className="btn-icon text-slate-300 hover:text-white"
          title="Ajustes de Cuadrícula (Tamaño, Color, Snap)"
        >
          <GridIcon className="w-5 h-5" />
        </button>

        <button
          onClick={handleImportClick}
          className="btn-icon text-slate-300 hover:text-white"
          title="Importar mapas (.uvtt) o imágenes/vídeos"
        >
          <Upload className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveSidebarTab(activeSidebarTab === 'library' ? null : 'library')}
          className={`btn-icon ${activeSidebarTab === 'library' ? 'active' : ''}`}
          title="Biblioteca de imágenes y mapas"
        >
          <FolderOpen className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowSaveLoadModal(true)}
          className="btn-icon text-slate-300 hover:text-white"
          title="Guardar / Cargar Partida (Cmd/Ctrl+S)"
        >
          <Save className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1.5" />

        <button
          onClick={undo}
          disabled={!canUndo}
          className={`btn-icon ${!canUndo ? 'opacity-30 cursor-not-allowed' : 'text-slate-300 hover:text-white'}`}
          title="Deshacer (Cmd/Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`btn-icon ${!canRedo ? 'opacity-30 cursor-not-allowed' : 'text-slate-300 hover:text-white'}`}
          title="Rehacer (Cmd/Ctrl+Y o Cmd+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Controles centrales: Niebla de guerra, cámaras y pantalla de jugadores */}
      <div className="flex items-center gap-2">
        {/* Controles de Niebla de guerra */}
        <div className="flex items-center bg-slate-800 p-0.5 rounded border border-slate-700">
          <button
            onClick={() => setFogConfig({ enabled: !game.fog.enabled })}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              game.fog.enabled
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Activar o desactivar la niebla de guerra para la ventana de jugadores"
          >
            {game.fog.enabled ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            <span>Niebla</span>
          </button>

          <button
            onClick={() => setShowResetFogConfirm(true)}
            className="p-1 text-slate-400 hover:text-amber-400 transition-colors ml-0.5"
            title="Reiniciar exploración de niebla (vuelve a oscurecer todo el mapa)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Vista previa de jugadores en la pantalla máster */}
        <button
          onClick={() => setIsPlayerPreviewMode(!isPlayerPreviewMode)}
          className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
            isPlayerPreviewMode
              ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
          }`}
          title="Previsualiza exactamente lo que ven los jugadores en su pantalla (con niebla de guerra activa)"
        >
          <Eye className="w-4 h-4 text-purple-300" />
          <span>Vista jugadores</span>
        </button>

        {/* Marco TV de jugadores */}
        <button
          onClick={() => setShowPlayerFrame(!showPlayerFrame)}
          className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
            showPlayerFrame
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-600'
          }`}
          title="Mostrar u ocultar en el tablero el marco verde discontinuo que representa la pantalla de los jugadores (TV)"
        >
          <Scan className="w-4 h-4 text-emerald-400" />
          <span>Marco TV</span>
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-0.5" />

        <button
          onClick={sendMasterCameraToPlayers}
          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 text-sky-400"
          title="Alinea la posición y zoom de la pantalla de jugadores con la tuya"
        >
          <Tv className="w-4 h-4" />
          <span>Enviar vista</span>
        </button>

        <button
          onClick={() => setFollowMasterCamera(!game.followMasterCamera)}
          className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
            game.followMasterCamera
              ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
          }`}
          title="Cuando está activo, cualquier movimiento o zoom de tu cámara se refleja instantáneamente en la pantalla de jugadores"
        >
          <span>Seguir mi cámara</span>
        </button>

        <button
          onClick={() => setShowDisplaysModal(true)}
          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 text-slate-200"
          title="Abrir o gestionar la pantalla de jugadores para monitor o TV"
        >
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span>Abrir pantalla</span>
        </button>
      </div>

      {/* Controles de la derecha: depuración UVTT y paneles laterales */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDebugVttOverlay(!showDebugVttOverlay)}
          className={`btn-icon ${showDebugVttOverlay ? 'text-sky-400' : 'text-slate-500'}`}
          title={showDebugVttOverlay ? 'Paredes y luces UVTT visibles en máster' : 'Paredes y luces UVTT ocultas'}
        >
          {showDebugVttOverlay ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span className="text-xs ml-1 font-mono">UVTT</span>
        </button>

        <div className="w-[1px] h-6 bg-slate-700 mx-1" />

        <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
          <button
            onClick={() => setActiveSidebarTab(activeSidebarTab === 'properties' ? null : 'properties')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeSidebarTab === 'properties' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Propiedades
          </button>
          <button
            onClick={() => setActiveSidebarTab(activeSidebarTab === 'layers' ? null : 'layers')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeSidebarTab === 'layers' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Capas
          </button>
          <button
            onClick={() => setActiveSidebarTab(activeSidebarTab === 'library' ? null : 'library')}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeSidebarTab === 'library' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Biblioteca
          </button>
        </div>
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
