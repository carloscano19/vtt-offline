import React, { useEffect, useState, useRef } from 'react';
import { getAllAssets, searchAssets, deleteAsset, updateAssetName, saveAsset } from '../../../db/dexie';
import { AssetItem } from '../../../types/game';
import { useGameStore } from '../../../stores/useGameStore';
import { Search, Upload, Trash2, Edit2, Check, Plus, Image as ImageIcon, Film } from 'lucide-react';
import { parseUVTT } from '../../../modules/import/uvttParser';
import { Entity } from '../../../types/entity';

export const LibraryTab: React.FC = () => {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const game = useGameStore((s) => s.game);
  const addEntity = useGameStore((s) => s.addEntity);

  const loadAssets = async (query = searchQuery) => {
    const list = query.trim() ? await searchAssets(query) : await getAllAssets();
    setAssets(list);
  };

  useEffect(() => {
    loadAssets(searchQuery);
  }, [searchQuery]);

  const handleStartEdit = (asset: AssetItem) => {
    setEditingId(asset.id);
    setEditName(asset.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (editName.trim()) {
      await updateAssetName(id, editName.trim());
      await loadAssets();
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar este asset de la biblioteca?')) {
      await deleteAsset(id);
      await loadAssets();
    }
  };

  const handleAddToBoard = (asset: AssetItem) => {
    const isMap = asset.type === 'map';
    const currentGridSize = game.grid.size || 70;

    let posX = game.masterCamera.x;
    let posY = game.masterCamera.y;
    let scale = 1;

    if (isMap) {
      const ppg = (asset as any).mapData?.pixelsPerGrid || (asset.width ? asset.width / 10 : 70);
      scale = currentGridSize / ppg;
      const mapW = (asset.width || 1000) * scale;
      const mapH = (asset.height || 1000) * scale;

      posX = game.masterCamera.x - mapW / 2;
      posY = game.masterCamera.y - mapH / 2;

      const existingMaps = game.entities.filter((e) => e.type === 'map');
      const isOverlapping = existingMaps.some((m) => {
        const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
        const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY;
        return !(posX + mapW <= m.x || posX >= m.x + mW || posY + mapH <= m.y || posY >= m.y + mH);
      });

      if (isOverlapping && existingMaps.length > 0) {
        let maxRight = -Infinity;
        let refY = posY;
        for (const m of existingMaps) {
          const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
          const right = m.x + mW;
          if (right > maxRight) {
            maxRight = right;
            refY = m.y;
          }
        }
        posX = maxRight + currentGridSize * 2;
        posY = refY;
      }
    } else {
      // Token: lado mayor ocupa 1 casilla y centrado en la cuadrícula
      const maxDim = Math.max(asset.width || 70, asset.height || 70);
      scale = maxDim > 0 ? currentGridSize / maxDim : 1;
      const halfGrid = currentGridSize / 2;
      posX = Math.floor(game.masterCamera.x / currentGridSize) * currentGridSize + halfGrid;
      posY = Math.floor(game.masterCamera.y / currentGridSize) * currentGridSize + halfGrid;
    }

    const newEntity: Entity = {
      id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: isMap ? 'map' : 'token',
      name: asset.name,
      assetId: asset.id,
      x: posX,
      y: posY,
      rotation: 0,
      scaleX: scale,
      scaleY: scale,
      zIndex: isMap ? 0 : 10,
      visibleToPlayers: isMap, // Mapas visibles, tokens ocultos por defecto
      locked: false,
      mapData: asset.mapData,
      side: isMap ? undefined : 'jugador',
      vision: isMap ? undefined : { active: true, brightRangeInSquares: 4, dimRangeInSquares: 2, hardness: 0.5 },
      statuses: []
    };

    addEntity(newEntity);

    // Convertir portales UVTT en puertas interactivas
    if (isMap && asset.mapData?.portals && asset.mapData.portals.length > 0) {
      for (let pIdx = 0; pIdx < asset.mapData.portals.length; pIdx++) {
        const portal = asset.mapData.portals[pIdx];
        if (portal.bounds && portal.bounds.length >= 2) {
          const doorEntity: Entity = {
            id: `door_${Date.now()}_${pIdx}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'door',
            name: `Puerta ${pIdx + 1}`,
            x: posX,
            y: posY,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: 40,
            visibleToPlayers: true,
            locked: false,
            mapId: newEntity.id,
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
    }

    // Convertir luces UVTT en entidades de luz interactivas
    if (isMap && asset.mapData?.lights && asset.mapData.lights.length > 0) {
      for (let lIdx = 0; lIdx < asset.mapData.lights.length; lIdx++) {
        const lgt = asset.mapData.lights[lIdx];
        const ppg = asset.mapData.pixelsPerGrid || 70;
        const totalRangeInSquares = Math.max(1, Math.round(lgt.range / ppg));
        const brightRadiusInSquares = Math.max(1, Math.round(totalRangeInSquares * 0.6));
        const dimRadiusInSquares = Math.max(0, totalRangeInSquares - brightRadiusInSquares);

        const lightEntity: Entity = {
          id: `light_${Date.now()}_${lIdx}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'light',
          name: `Luz ${lIdx + 1}`,
          x: posX + lgt.position.x,
          y: posY + lgt.position.y,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          zIndex: 45,
          visibleToPlayers: true,
          locked: false,
          mapId: newEntity.id,
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
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name;
      const lower = name.toLowerCase();

      try {
        if (lower.endsWith('.uvtt') || lower.endsWith('.dd2vtt') || lower.endsWith('.df2vtt')) {
          const text = await file.text();
          const parsed = parseUVTT(text);
          const asset: AssetItem = {
            id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: name.replace(/\.[^/.]+$/, ''),
            type: 'map',
            mimeType: parsed.mimeType,
            blob: parsed.imageBlob,
            createdAt: Date.now(),
            width: parsed.widthPx,
            height: parsed.heightPx,
            mapData: parsed.mapData
          };
          await saveAsset(asset);
        } else {
          let type: 'image' | 'gif' | 'video' = 'image';
          if (file.type.includes('gif') || lower.endsWith('.gif')) type = 'gif';
          if (file.type.includes('video') || lower.endsWith('.mp4') || lower.endsWith('.webm')) type = 'video';

          let width: number | undefined;
          let height: number | undefined;
          try {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = objectUrl;
            if (typeof img.decode === 'function') {
              await img.decode();
            } else {
              await new Promise<void>((res, rej) => {
                img.onload = () => res();
                img.onerror = rej;
              });
            }
            width = img.naturalWidth || img.width;
            height = img.naturalHeight || img.height;
            URL.revokeObjectURL(objectUrl);
          } catch {
            // Si falla la decodificación previa, continuar
          }

          const asset: AssetItem = {
            id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: name.replace(/\.[^/.]+$/, ''),
            type,
            mimeType: file.type || 'image/png',
            blob: file,
            createdAt: Date.now(),
            width,
            height
          };
          await saveAsset(asset);
        }
      } catch (err) {
        console.error('Error al subir asset:', err);
      }
    }

    await loadAssets();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-3 text-xs text-slate-200 overflow-y-auto max-h-full space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".uvtt,.dd2vtt,.df2vtt,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Buscador en tiempo real y botón de subir */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en biblioteca..."
            className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 bg-sky-700 hover:bg-sky-600 text-white rounded border border-sky-500"
          title="Añadir archivos a la biblioteca"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>

      {/* Cuadrícula de assets con miniaturas */}
      {assets.length === 0 ? (
        <div className="p-6 text-center text-slate-500">
          <p>No hay elementos en la biblioteca.</p>
          <p className="text-[11px] mt-1 text-slate-600">Sube imágenes, mapas o vídeos para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) => {
            const objectUrl = URL.createObjectURL(asset.blob);
            const isEditing = editingId === asset.id;

            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/vtt-asset',
                    JSON.stringify({
                      id: asset.id,
                      name: asset.name,
                      type: asset.type,
                      width: asset.width,
                      height: asset.height,
                      mapData: (asset as any).mapData
                    })
                  );
                }}
                className="group relative bg-slate-800/90 hover:bg-slate-750 border border-slate-700 rounded overflow-hidden flex flex-col cursor-grab active:cursor-grabbing transition-all hover:border-sky-500/80 shadow"
              >
                {/* Miniatura */}
                <div className="w-full h-24 bg-slate-900/80 flex items-center justify-center overflow-hidden relative">
                  {asset.type === 'video' ? (
                    <div className="flex flex-col items-center text-slate-400">
                      <Film className="w-8 h-8 opacity-60" />
                      <span className="text-[10px] mt-1">Vídeo</span>
                    </div>
                  ) : (
                    <img
                      src={objectUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onLoad={() => URL.revokeObjectURL(objectUrl)}
                    />
                  )}

                  {/* Badge de tipo */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-900/80 text-sky-300 border border-slate-700">
                    {asset.type}
                  </span>

                  {/* Botón rápido Añadir */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToBoard(asset);
                    }}
                    className="absolute bottom-1 right-1 p-1 bg-sky-600 hover:bg-sky-500 text-white rounded shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Añadir al tablero"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Pie con nombre y acciones */}
                <div className="p-1.5 flex items-center justify-between gap-1 bg-slate-800">
                  {isEditing ? (
                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-slate-900 border border-sky-500 rounded px-1 py-0.5 text-[11px] text-white"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(asset.id)}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="truncate font-medium text-[11px] text-slate-200" title={asset.name}>
                        {asset.name}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleStartEdit(asset)}
                          className="p-1 text-slate-400 hover:text-sky-300"
                          title="Renombrar"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Eliminar de biblioteca"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
