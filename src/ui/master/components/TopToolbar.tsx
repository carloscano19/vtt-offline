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
  Settings2
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

  const game = useGameStore((s) => s.game);
  const addEntity = useGameStore((s) => s.addEntity);
  const sendMasterCameraToPlayers = useGameStore((s) => s.sendMasterCameraToPlayers);
  const setFollowMasterCamera = useGameStore((s) => s.setFollowMasterCamera);
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
            mimeType: parsed.imageBlob.type,
            blob: parsed.imageBlob,
            createdAt: Date.now(),
            width: parsed.widthPx,
            height: parsed.heightPx
          };

          await saveAsset(asset);

          // Crear entidad en el tablero
          const scale = game.grid.size / parsed.pixelsPerGrid;
          const entity: Entity = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'map',
            name: asset.name,
            assetId: asset.id,
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: scale,
            scaleY: scale,
            zIndex: 0,
            visibleToPlayers: true,
            locked: false,
            mapData: parsed.mapData
          };

          addEntity(entity);
        } else {
          // Imagen, GIF o Video (Token/Objeto)
          let type: 'image' | 'gif' | 'video' = 'image';
          if (file.type.includes('gif') || lowerName.endsWith('.gif')) {
            type = 'gif';
          } else if (file.type.includes('video') || lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
            type = 'video';
          }

          const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const asset: AssetItem = {
            id: assetId,
            name: name.replace(/\.[^/.]+$/, ''),
            type,
            mimeType: file.type || 'image/png',
            blob: file,
            createdAt: Date.now()
          };

          await saveAsset(asset);

          // Crear token en el centro del máster
          const entity: Entity = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'token',
            name: asset.name,
            assetId: asset.id,
            x: game.masterCamera.x,
            y: game.masterCamera.y,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: 10,
            visibleToPlayers: true,
            locked: false,
            side: 'jugador',
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

      {/* Controles centrales: sincronización de cámara y pantalla de jugadores */}
      <div className="flex items-center gap-2">
        <button
          onClick={sendMasterCameraToPlayers}
          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 text-sky-400"
          title="Alinea la posición y zoom de la pantalla de jugadores con la tuya"
        >
          <Tv className="w-4 h-4" />
          <span>Enviar vista a jugadores</span>
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
          title="Gestionar en qué monitor o TV se proyecta la ventana de jugadores"
        >
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span>Pantalla jugadores</span>
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
    </header>
  );
};
