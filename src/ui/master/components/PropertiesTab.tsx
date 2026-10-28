import React from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import {
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Shield,
  Users,
  Crosshair,
  BrickWall,
  DoorClosed,
  DoorOpen,
  Flame,
  Sliders,
  Play,
  Pipette,
  RotateCw,
  RefreshCcw,
  Sparkles
} from 'lucide-react';
import { TokenSide, recalculateDoorEndpoints, getDefaultSnapToGrid } from '../../../types/entity';
import { getAsset, db } from '../../../db/dexie';
import { cloudSync } from '../../../modules/sync/cloudSync';
import { getMediaDimensions, persistAssetDimensions } from '../../../utils/mediaDimensions';
import { EyeDropperButton } from '../../common/EyeDropperButton';

const EFFECT_PRESET_NAMES: Record<string, string> = {
  torch: 'Antorcha de pared',
  campfire: 'Hoguera',
  brazier: 'Brasero',
  lantern: 'Farol',
  candle: 'Vela',
  fire_small: 'Llamas pequeñas',
  fire_large: 'Incendio grande',
  fire_magic: 'Fuego mágico',
  smoke_light: 'Humo ligero',
  smoke_dense: 'Humareda densa',
  fog_low: 'Niebla baja',
  magic_seal: 'Sello mágico',
  portal: 'Portal arcano',
  lightning: 'Rayos',
  ice_zone: 'Zona de hielo'
};

export const PropertiesTab: React.FC = () => {
  const game = useGameStore((s) => s.game);
  const updateEntity = useGameStore((s) => s.updateEntity);
  const removeEntities = useGameStore((s) => s.removeEntities);
  const toggleDoor = useGameStore((s) => s.toggleDoor);
  const setDoorLocked = useGameStore((s) => s.setDoorLocked);

  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const selectedEntity = game.entities.find((e) => selectedEntityIds.includes(e.id));

  const [assetDims, setAssetDims] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    let isCancelled = false;
    if (selectedEntity?.assetId) {
      getAsset(selectedEntity.assetId).then(async (asset) => {
        if (!asset || isCancelled) return;
        if (asset.width && asset.height) {
          setAssetDims({ width: asset.width, height: asset.height });
        } else if (asset.blob) {
          try {
            const dims = await getMediaDimensions(asset.blob);
            if (!isCancelled && dims && dims.width > 0 && dims.height > 0) {
              setAssetDims(dims);
              await persistAssetDimensions(asset.id, dims.width, dims.height);
            }
          } catch {}
        }
      });
    } else {
      setAssetDims(null);
    }
    return () => {
      isCancelled = true;
    };
  }, [selectedEntity?.assetId]);

  if (!selectedEntity) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-40 text-sky-400" />
        <p className="font-medium text-slate-300">Ninguna entidad seleccionada</p>
        <p className="text-xs mt-1 text-slate-500">
          Haz clic en un token o mapa en el tablero, o elígelo desde la pestaña de Capas.
        </p>
      </div>
    );
  }

  const handleUpdate = (partial: any) => {
    updateEntity(selectedEntity.id, partial);
  };

  const handleDelete = () => {
    removeEntities([selectedEntity.id]);
    clearSelection();
  };

  const degrees = Math.round((selectedEntity.rotation * 180) / Math.PI);

  return (
    <div className="p-4 space-y-4 text-xs text-slate-200 overflow-y-auto max-h-full">
      {/* Cabecera con Nombre y tipo */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="uppercase text-[10px] tracking-wider text-slate-400 font-bold">
            {selectedEntity.type === 'map'
              ? 'Mapa'
              : selectedEntity.type === 'token'
              ? 'Token'
              : selectedEntity.type === 'wall'
              ? 'Pared Invisible'
              : selectedEntity.type === 'door'
              ? 'Puerta'
              : selectedEntity.type === 'light'
              ? 'Luz / Antorcha'
              : selectedEntity.type === 'effect'
              ? 'Efecto Animado'
              : 'Objeto'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleUpdate({ locked: !selectedEntity.locked })}
              className={`p-1.5 rounded border transition-colors ${
                selectedEntity.locked
                  ? 'bg-red-950/60 border-red-500/80 text-red-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={selectedEntity.locked ? 'Bloqueado (No se puede mover en el tablero)' : 'Desbloqueado'}
            >
              {selectedEntity.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleUpdate({ visibleToPlayers: !selectedEntity.visibleToPlayers })}
              className={`p-1.5 rounded border transition-colors ${
                selectedEntity.visibleToPlayers
                  ? 'bg-slate-800 border-slate-700 text-sky-400'
                  : 'bg-slate-800 border-slate-600 text-slate-500'
              }`}
              title={selectedEntity.visibleToPlayers ? 'Visible para los jugadores' : 'Oculto para los jugadores'}
            >
              {selectedEntity.visibleToPlayers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <input
          type="text"
          value={selectedEntity.name}
          onChange={(e) => handleUpdate({ name: e.target.value })}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-sky-500"
          placeholder="Nombre de la entidad"
        />
      </div>

      {/* Opacidad (0–100%) para cualquier entidad */}
      <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-1.5">
        <div className="flex justify-between items-center text-slate-300">
          <span className="font-medium">Opacidad</span>
          <span className="font-mono text-sky-400 font-semibold">
            {Math.round(((typeof selectedEntity.opacity === 'number' ? selectedEntity.opacity : 1.0)) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(((typeof selectedEntity.opacity === 'number' ? selectedEntity.opacity : 1.0)) * 100)}
          onChange={(e) =>
            handleUpdate({
              opacity: (parseInt(e.target.value) || 0) / 100
            })
          }
          className="w-full accent-sky-500 cursor-pointer"
        />
      </div>

      {/* Ajustar a la cuadrícula por entidad */}
      <div className="bg-slate-800/60 p-2.5 rounded border border-slate-700">
        <label className="flex items-center justify-between text-xs cursor-pointer">
          <div>
            <span className="text-slate-300 font-medium block">Ajustar a la cuadrícula</span>
            <span className="text-[10px] text-slate-500 block">
              {getDefaultSnapToGrid(selectedEntity)
                ? 'Alineado al centro de la casilla'
                : 'Posicionamiento libre (flechas mueven 1/4 casilla)'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={getDefaultSnapToGrid(selectedEntity)}
            onChange={(e) => handleUpdate({ snapToGrid: e.target.checked })}
            className="w-4 h-4 accent-sky-500 cursor-pointer ml-3 shrink-0"
          />
        </label>
      </div>

      {/* Selector de bando para tokens */}
      {selectedEntity.type === 'token' && (
        <div className="space-y-1.5">
          <label className="text-slate-400 font-medium">Bando</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['jugador', 'enemigo', 'neutral'] as TokenSide[]).map((side) => {
              const isSelected = (selectedEntity.side || 'jugador') === side;
              return (
                <button
                  key={side}
                  onClick={() => {
                    if (side === 'jugador' && !selectedEntity.vision) {
                      handleUpdate({
                        side,
                        vision: {
                          active: true,
                          brightRangeInSquares: 4,
                          dimRangeInSquares: 2,
                          hardness: 0.5
                        }
                      });
                    } else {
                      handleUpdate({ side });
                    }
                  }}
                  className={`py-1.5 px-2 rounded font-medium capitalize text-center border transition-all ${
                    isSelected
                      ? side === 'jugador'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : side === 'enemigo'
                        ? 'bg-red-950/80 border-red-500 text-red-300'
                        : 'bg-yellow-950/80 border-yellow-500 text-yellow-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {side}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Panel de Visión para tokens con bando 'jugador' */}
      {selectedEntity.type === 'token' && (selectedEntity.side || 'jugador') === 'jugador' && (
        <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              Visión del Token
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(selectedEntity.vision?.active)}
                onChange={(e) =>
                  handleUpdate({
                    vision: {
                      active: e.target.checked,
                      brightRangeInSquares:
                        selectedEntity.vision?.brightRangeInSquares ?? selectedEntity.vision?.rangeInSquares ?? 4,
                      dimRangeInSquares: selectedEntity.vision?.dimRangeInSquares ?? 2,
                      hardness: selectedEntity.vision?.hardness ?? 0.5
                    }
                  })
                }
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {Boolean(selectedEntity.vision?.active) && (
            <div className="space-y-3 pt-1 border-t border-slate-700/60">
              {/* 1. Alcance claro */}
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Alcance claro (casillas)</span>
                  <span className="text-white font-mono">
                    {(selectedEntity.vision?.brightRangeInSquares ?? selectedEntity.vision?.rangeInSquares ?? 4) === 0
                      ? 'Ilimitado'
                      : `${selectedEntity.vision?.brightRangeInSquares ?? selectedEntity.vision?.rangeInSquares ?? 4} cas.`}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedEntity.vision?.brightRangeInSquares ?? selectedEntity.vision?.rangeInSquares ?? 4}
                  onChange={(e) =>
                    handleUpdate({
                      vision: {
                        active: Boolean(selectedEntity.vision?.active),
                        brightRangeInSquares: Math.max(0, parseInt(e.target.value) || 0),
                        dimRangeInSquares: selectedEntity.vision?.dimRangeInSquares ?? 2,
                        hardness: selectedEntity.vision?.hardness ?? 0.5
                      }
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
                <span className="text-[10px] text-slate-500">0 = Alcance ilimitado hasta paredes</span>
              </div>

              {/* 2. Alcance tenue */}
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Alcance tenue (adicionales)</span>
                  <span className="text-white font-mono">
                    {`+${selectedEntity.vision?.dimRangeInSquares ?? 2} cas.`}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedEntity.vision?.dimRangeInSquares ?? 2}
                  onChange={(e) =>
                    handleUpdate({
                      vision: {
                        active: Boolean(selectedEntity.vision?.active),
                        brightRangeInSquares:
                          selectedEntity.vision?.brightRangeInSquares ?? selectedEntity.vision?.rangeInSquares ?? 4,
                        dimRangeInSquares: Math.max(0, parseInt(e.target.value) || 0),
                        hardness: selectedEntity.vision?.hardness ?? 0.5
                      }
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
                <span className="text-[10px] text-slate-500">Casillas en penumbra (50% de oscuridad)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Posición (X, Y) */}
      <div className="space-y-1.5">
        <label className="text-slate-400 font-medium">Posición (Píxeles)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-500 block">X</span>
            <input
              type="number"
              value={Math.round(selectedEntity.x)}
              onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">Y</span>
            <input
              type="number"
              value={Math.round(selectedEntity.y)}
              onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Rotación y Escala */}
      <div className="space-y-1.5">
        <label className="text-slate-400 font-medium">Rotación ({degrees}°)</label>
        <input
          type="range"
          min="0"
          max="360"
          value={(degrees % 360 + 360) % 360}
          onChange={(e) => handleUpdate({ rotation: (parseFloat(e.target.value) * Math.PI) / 180 })}
          className="w-full accent-sky-500 cursor-pointer"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-slate-400 font-medium">Escala</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-500 block">X</span>
            <input
              type="number"
              step="0.05"
              value={parseFloat(selectedEntity.scaleX.toFixed(2))}
              onChange={(e) => handleUpdate({ scaleX: parseFloat(e.target.value) || 1 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">Y</span>
            <input
              type="number"
              step="0.05"
              value={parseFloat(selectedEntity.scaleY.toFixed(2))}
              onChange={(e) => handleUpdate({ scaleY: parseFloat(e.target.value) || 1 })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Datos de pared si corresponde */}
      {selectedEntity.type === 'wall' && (
        <div className="bg-slate-800/60 p-2.5 rounded border border-slate-700 space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <BrickWall className="w-4 h-4" />
            <span>Propiedades de Pared Invisible</span>
          </div>
          <p className="text-slate-400">Nodos de línea: <span className="text-white font-mono">{selectedEntity.points?.length || 0}</span></p>
          {selectedEntity.mapId ? (
            <p className="text-slate-400">
              Vinculada a mapa: <span className="text-sky-300 font-mono">
                {game.entities.find((e) => e.id === selectedEntity.mapId)?.name || selectedEntity.mapId}
              </span> (coordenadas locales)
            </p>
          ) : (
            <p className="text-slate-400">Vinculada a: <span className="text-slate-300">Tablero global</span></p>
          )}
          <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-300">
            <input
              type="checkbox"
              checked={!!selectedEntity.closed}
              onChange={(e) => handleUpdate({ closed: e.target.checked })}
              className="w-3.5 h-3.5 accent-sky-500 rounded cursor-pointer"
            />
            <span>Polígono cerrado (unir fin con inicio)</span>
          </label>
        </div>
      )}

      {/* Datos del mapa UVTT si corresponde */}
      {selectedEntity.type === 'map' && selectedEntity.mapData && (
        <div className="bg-slate-800/60 p-2.5 rounded border border-slate-700 space-y-1">
          <p className="font-semibold text-slate-300">Datos Universal VTT:</p>
          <p className="text-slate-400">Casillas: {selectedEntity.mapData.gridWidth} x {selectedEntity.mapData.gridHeight}</p>
          <p className="text-slate-400">Resolución nativa: {selectedEntity.mapData.pixelsPerGrid} px/casilla</p>
          <p className="text-slate-400">Paredes: {selectedEntity.mapData.walls?.length || 0}</p>
          <p className="text-slate-400">Portales: {selectedEntity.mapData.portals?.length || 0}</p>
          <p className="text-slate-400">Luces: {selectedEntity.mapData.lights?.length || 0}</p>
        </div>
      )}

      {/* Propiedades de Puerta si corresponde */}
      {selectedEntity.type === 'door' && selectedEntity.door && (
        <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-400 flex items-center gap-1.5">
              {selectedEntity.door.isOpen ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
              Propiedades de Puerta
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium border uppercase"
              style={{
                borderColor: selectedEntity.door.isOpen ? '#10b981' : '#f59e0b',
                color: selectedEntity.door.isOpen ? '#10b981' : '#f59e0b'
              }}
            >
              {selectedEntity.door.isOpen ? 'Abierta' : 'Cerrada'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (selectedEntity.door?.isLocked) return;
                toggleDoor(selectedEntity.id);
              }}
              disabled={selectedEntity.door.isLocked}
              className={`py-2 px-2.5 rounded font-medium text-xs flex items-center justify-center gap-1.5 border transition-all ${
                selectedEntity.door.isLocked
                  ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-400'
                  : selectedEntity.door.isOpen
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 hover:bg-emerald-900'
                  : 'bg-amber-950/80 border-amber-500 text-amber-300 hover:bg-amber-900'
              }`}
            >
              {selectedEntity.door.isOpen ? <DoorOpen className="w-3.5 h-3.5" /> : <DoorClosed className="w-3.5 h-3.5" />}
              <span>{selectedEntity.door.isOpen ? 'Cerrar' : 'Abrir'}</span>
            </button>

            <button
              onClick={() => setDoorLocked(selectedEntity.id, !selectedEntity.door?.isLocked)}
              className={`py-2 px-2.5 rounded font-medium text-xs flex items-center justify-center gap-1.5 border transition-all ${
                selectedEntity.door.isLocked
                  ? 'bg-red-950/80 border-red-500 text-red-300 hover:bg-red-900'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {selectedEntity.door.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{selectedEntity.door.isLocked ? 'Candado ON' : 'Candado OFF'}</span>
            </button>
          </div>

          {/* Largo (casillas) */}
          <div className="pt-2 border-t border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Largo (casillas)</span>
              {(() => {
                const parentMap = selectedEntity.mapId ? game.entities.find((m) => m.id === selectedEntity.mapId) : undefined;
                const gridSize = parentMap?.mapData?.pixelsPerGrid ?? (game.grid.size > 0 ? game.grid.size : 70);
                const currentPx = selectedEntity.door.length ?? Math.hypot(selectedEntity.door.p2.x - selectedEntity.door.p1.x, selectedEntity.door.p2.y - selectedEntity.door.p1.y);
                const currentSquares = parseFloat((currentPx / gridSize).toFixed(2));
                return (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="20"
                      value={currentSquares}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (isNaN(val) || val <= 0) return;
                        const newPx = Math.max(10, val * gridSize);
                        const isInv = selectedEntity.door?.isHingeInverted ?? false;
                        const { p1, p2 } = recalculateDoorEndpoints(
                          selectedEntity.x,
                          selectedEntity.y,
                          selectedEntity.rotation,
                          newPx,
                          isInv
                        );
                        handleUpdate({
                          scaleX: 1,
                          scaleY: 1,
                          door: {
                            ...selectedEntity.door!,
                            length: newPx,
                            p1,
                            p2
                          }
                        });
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-slate-400 text-[11px]">sq</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Cambiar bisagra de extremo */}
          <div className="pt-2 border-t border-slate-700/80">
            <button
              onClick={() => {
                if (!selectedEntity.door) return;
                const isInv = !selectedEntity.door.isHingeInverted;
                handleUpdate({
                  door: {
                    ...selectedEntity.door,
                    isHingeInverted: isInv,
                    p1: selectedEntity.door.p2,
                    p2: selectedEntity.door.p1
                  }
                });
              }}
              className="w-full py-1.5 px-3 rounded text-xs font-medium bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 transition-colors flex items-center justify-center gap-2"
              title="Intercambia el punto de giro de la puerta al otro extremo"
            >
              <RotateCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Cambiar bisagra de extremo</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            {selectedEntity.door.isLocked
              ? 'La puerta está bloqueada con candado: no se puede abrir/cerrar accidentalmente.'
              : selectedEntity.door.isOpen
              ? 'La puerta está abierta: la visión de los jugadores atraviesa este umbral.'
              : 'La puerta está cerrada: bloquea la visión como una pared.'}
          </p>
        </div>
      )}

      {/* Propiedades de Luz si corresponde */}
      {selectedEntity.type === 'light' && selectedEntity.light && (
        <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-3">
          <div className="flex items-center justify-between text-amber-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              <span>Propiedades de Luz</span>
            </span>
          </div>

          {/* Color e Intensidad */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-400 block mb-1">Color de la luz</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedEntity.light.color}
                  onChange={(e) =>
                    handleUpdate({
                      light: { ...selectedEntity.light!, color: e.target.value }
                    })
                  }
                  className="w-7 h-7 rounded cursor-pointer border border-slate-600 bg-transparent"
                />
                <EyeDropperButton
                  onColorSelect={(hex) =>
                    handleUpdate({
                      light: { ...selectedEntity.light!, color: hex }
                    })
                  }
                />
                <span className="font-mono text-[11px] text-slate-300 uppercase">
                  {selectedEntity.light.color}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block mb-1">
                Intensidad ({selectedEntity.light.intensity}%)
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={selectedEntity.light.intensity}
                onChange={(e) =>
                  handleUpdate({
                    light: { ...selectedEntity.light!, intensity: parseInt(e.target.value) || 0 }
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Radios Claro y Tenue */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                <span>Radio claro</span>
                <span className="text-white font-mono">{selectedEntity.light.brightRadiusInSquares} cas.</span>
              </div>
              <input
                type="number"
                min="0"
                max="50"
                value={selectedEntity.light.brightRadiusInSquares}
                onChange={(e) =>
                  handleUpdate({
                    light: {
                      ...selectedEntity.light!,
                      brightRadiusInSquares: Math.max(0, parseInt(e.target.value) || 0)
                    }
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                <span>Radio tenue</span>
                <span className="text-white font-mono">+{selectedEntity.light.dimRadiusInSquares} cas.</span>
              </div>
              <input
                type="number"
                min="0"
                max="50"
                value={selectedEntity.light.dimRadiusInSquares}
                onChange={(e) =>
                  handleUpdate({
                    light: {
                      ...selectedEntity.light!,
                      dimRadiusInSquares: Math.max(0, parseInt(e.target.value) || 0)
                    }
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              />
            </div>
          </div>

          {/* Dureza del borde y Parpadeo */}
          <div className="space-y-2 pt-1 border-t border-slate-700/60">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                <span>Dureza del borde</span>
                <span className="text-white font-mono">{Math.round(selectedEntity.light.edgeHardness * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedEntity.light.edgeHardness}
                onChange={(e) =>
                  handleUpdate({
                    light: {
                      ...selectedEntity.light!,
                      edgeHardness: parseFloat(e.target.value) || 0.5
                    }
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">0 = Suave / difuso, 1 = Nítido</span>
            </div>

            <label className="flex items-center justify-between cursor-pointer pt-1">
              <span className="text-slate-300">Parpadeo de antorcha</span>
              <input
                type="checkbox"
                checked={selectedEntity.light.flicker}
                onChange={(e) =>
                  handleUpdate({
                    light: {
                      ...selectedEntity.light!,
                      flicker: e.target.checked
                    }
                  })
                }
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Propiedades de Efecto si corresponde */}
      {selectedEntity.type === 'effect' && selectedEntity.effect && (
        <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-3">
          <div className="flex items-center justify-between text-amber-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Propiedades del Efecto</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border border-amber-500/40 bg-amber-950/40 text-amber-300">
              {EFFECT_PRESET_NAMES[selectedEntity.effect.preset] || selectedEntity.effect.preset}
            </span>
          </div>

          {/* Color / Tinte */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Color / Tinte</span>
              <span className="font-mono text-white uppercase">{selectedEntity.effect.color}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedEntity.effect.color || '#ff7700'}
                onChange={(e) => {
                  const newCol = e.target.value;
                  const upd: any = {
                    effect: { ...selectedEntity.effect!, color: newCol }
                  };
                  if (selectedEntity.effect?.emitsLight && selectedEntity.light) {
                    upd.light = { ...selectedEntity.light, color: newCol };
                  }
                  handleUpdate(upd);
                }}
                className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent shrink-0"
              />
              <EyeDropperButton
                onColorSelect={(hex) => {
                  const upd: any = {
                    effect: { ...selectedEntity.effect!, color: hex }
                  };
                  if (selectedEntity.effect?.emitsLight && selectedEntity.light) {
                    upd.light = { ...selectedEntity.light, color: hex };
                  }
                  handleUpdate(upd);
                }}
              />
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { name: 'Fuego', color: '#f97316' },
                  { name: 'Carmesí', color: '#ef4444' },
                  { name: 'Arcano', color: '#a855f7' },
                  { name: 'Hielo', color: '#38bdf8' },
                  { name: 'Vil', color: '#22c55e' },
                  { name: 'Sagrado', color: '#eab308' },
                  { name: 'Humo', color: '#94a3b8' }
                ].map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => {
                      const upd: any = {
                        effect: { ...selectedEntity.effect!, color: c.color }
                      };
                      if (selectedEntity.effect?.emitsLight && selectedEntity.light) {
                        upd.light = { ...selectedEntity.light, color: c.color };
                      }
                      handleUpdate(upd);
                    }}
                    className="w-5 h-5 rounded-full border border-slate-600 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.color }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Intensidad */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
              <span>Intensidad</span>
              <span className="text-white font-mono">{selectedEntity.effect.intensity}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={selectedEntity.effect.intensity}
              onChange={(e) => {
                const newInt = parseInt(e.target.value) || 80;
                const upd: any = {
                  effect: { ...selectedEntity.effect!, intensity: newInt }
                };
                if (selectedEntity.effect?.emitsLight && selectedEntity.light) {
                  upd.light = { ...selectedEntity.light, intensity: newInt };
                }
                handleUpdate(upd);
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Velocidad de animación */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
              <span>Velocidad de animación</span>
              <span className="text-white font-mono">{selectedEntity.effect.speed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.1"
              value={selectedEntity.effect.speed}
              onChange={(e) =>
                handleUpdate({
                  effect: { ...selectedEntity.effect!, speed: parseFloat(e.target.value) || 1.0 }
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Tamaño rápido (Casillas) */}
          <div>
            <span className="text-[11px] text-slate-400 block mb-1">Tamaño en el tablero</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(() => {
                const isCustomWithAsset = selectedEntity.effect?.preset === 'custom' && selectedEntity.assetId;
                const maxDim = assetDims ? Math.max(assetDims.width, assetDims.height) : 0;
                const gridSize = game.grid.size > 0 ? game.grid.size : 70;

                const getScaleForCells = (cells: number) => {
                  if (isCustomWithAsset && maxDim > 0) {
                    return parseFloat(((cells * gridSize) / maxDim).toFixed(3));
                  }
                  return cells;
                };

                return [
                  { label: '0.5x0.5', val: 0.5 },
                  { label: '1x1', val: 1 },
                  { label: '2x2', val: 2 },
                  { label: '3x3', val: 3 }
                ].map((sz) => {
                  const targetScale = getScaleForCells(sz.val);
                  const isCurrent = Math.abs(selectedEntity.scaleX - targetScale) < 0.05;

                  return (
                    <button
                      key={sz.val}
                      type="button"
                      onClick={() => {
                        const upd: any = {
                          scaleX: targetScale,
                          scaleY: targetScale
                        };
                        if (selectedEntity.effect?.emitsLight && selectedEntity.light) {
                          upd.light = {
                            ...selectedEntity.light,
                            brightRadiusInSquares: (selectedEntity.effect.baseLightRadius || 3) * sz.val,
                            dimRadiusInSquares: 2 * sz.val
                          };
                        }
                        handleUpdate(upd);
                      }}
                      className={`py-1 text-center rounded text-[11px] font-medium border transition-colors ${
                        isCurrent
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-slate-700/60 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {sz.label}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Emite luz dinámica */}
          <div className="pt-2 border-t border-slate-700/80 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium text-slate-200 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Emite luz dinámica</span>
              </span>
              <input
                type="checkbox"
                checked={selectedEntity.effect.emitsLight}
                onChange={(e) => {
                  const emits = e.target.checked;
                  const scale = Math.max(selectedEntity.scaleX || 1, selectedEntity.scaleY || 1);
                  const isFireOrTorch =
                    selectedEntity.effect?.preset === 'torch' ||
                    selectedEntity.effect?.preset === 'campfire' ||
                    selectedEntity.effect?.preset === 'brazier' ||
                    selectedEntity.effect?.preset === 'candle' ||
                    (selectedEntity.effect?.preset || '').startsWith('fire');

                  handleUpdate({
                    effect: { ...selectedEntity.effect!, emitsLight: emits },
                    light: emits
                      ? {
                          color: selectedEntity.effect?.color || '#ff7700',
                          intensity: selectedEntity.effect?.intensity ?? 80,
                          brightRadiusInSquares: (selectedEntity.effect?.baseLightRadius || 3) * scale,
                          dimRadiusInSquares: 2 * scale,
                          edgeHardness: 0.5,
                          flicker: isFireOrTorch
                        }
                      : undefined
                  });
                }}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>

            {selectedEntity.effect.emitsLight && (
              <div className="space-y-2 pt-1 border-t border-slate-700/60">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                      <span>Radio claro</span>
                      <span className="text-white font-mono">{selectedEntity.effect.baseLightRadius} cas.</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={selectedEntity.effect.baseLightRadius}
                      onChange={(e) => {
                        const newRad = Math.max(1, parseInt(e.target.value) || 1);
                        const scale = Math.max(selectedEntity.scaleX || 1, selectedEntity.scaleY || 1);
                        handleUpdate({
                          effect: { ...selectedEntity.effect!, baseLightRadius: newRad },
                          light: {
                            ...(selectedEntity.light || {
                              color: selectedEntity.effect!.color,
                              intensity: selectedEntity.effect!.intensity,
                              edgeHardness: 0.5,
                              flicker: true
                            }),
                            brightRadiusInSquares: newRad * scale,
                            dimRadiusInSquares: (selectedEntity.light?.dimRadiusInSquares ?? 2)
                          }
                        });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                      <span>Radio tenue</span>
                      <span className="text-white font-mono">+{selectedEntity.light?.dimRadiusInSquares ?? 2} cas.</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={selectedEntity.light?.dimRadiusInSquares ?? 2}
                      onChange={(e) => {
                        const newDim = Math.max(0, parseInt(e.target.value) || 0);
                        handleUpdate({
                          light: {
                            ...(selectedEntity.light || {
                              color: selectedEntity.effect!.color,
                              intensity: selectedEntity.effect!.intensity,
                              edgeHardness: 0.5,
                              flicker: true,
                              brightRadiusInSquares: (selectedEntity.effect?.baseLightRadius || 3) * Math.max(selectedEntity.scaleX || 1, selectedEntity.scaleY || 1)
                            }),
                            dimRadiusInSquares: newDim
                          }
                        });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer pt-1">
                  <span className="text-slate-300 text-[11px]">Parpadeo de antorcha</span>
                  <input
                    type="checkbox"
                    checked={selectedEntity.light?.flicker ?? true}
                    onChange={(e) => {
                      handleUpdate({
                        light: {
                          ...(selectedEntity.light || {
                            color: selectedEntity.effect!.color,
                            intensity: selectedEntity.effect!.intensity,
                            edgeHardness: 0.5,
                            brightRadiusInSquares: (selectedEntity.effect?.baseLightRadius || 3) * Math.max(selectedEntity.scaleX || 1, selectedEntity.scaleY || 1),
                            dimRadiusInSquares: 2
                          }),
                          flicker: e.target.checked
                        }
                      });
                    }}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
                <span className="text-[10px] text-slate-500 block">
                  💡 El radio crece automáticamente si escalas el efecto en el tablero con las manijas.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ajustes visuales (Tono, Saturación, Brillo) */}
      {selectedEntity.type !== 'wall' && selectedEntity.type !== 'door' && selectedEntity.type !== 'light' && (
      <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sky-400 flex items-center gap-1.5">
            <Sliders className="w-4 h-4" />
            <span>Ajustes Visuales</span>
          </span>
          <button
            onClick={() =>
              handleUpdate({
                filters: { hue: 0, saturation: 1, brightness: 1 }
              })
            }
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            title="Restablecer color original"
          >
            <RefreshCcw className="w-3 h-3" />
            <span>Restablecer</span>
          </button>
        </div>

        {/* Tono (Hue) */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
            <span>Tono (Hue)</span>
            <span className="text-white font-mono">{selectedEntity.filters?.hue ?? 0}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={selectedEntity.filters?.hue ?? 0}
            onChange={(e) =>
              handleUpdate({
                filters: {
                  hue: parseInt(e.target.value) || 0,
                  saturation: selectedEntity.filters?.saturation ?? 1,
                  brightness: selectedEntity.filters?.brightness ?? 1
                }
              })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        {/* Saturación */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
            <span>Saturación</span>
            <span className="text-white font-mono">
              {Math.round((selectedEntity.filters?.saturation ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={selectedEntity.filters?.saturation ?? 1}
            onChange={(e) =>
              handleUpdate({
                filters: {
                  hue: selectedEntity.filters?.hue ?? 0,
                  saturation: parseFloat(e.target.value) || 1,
                  brightness: selectedEntity.filters?.brightness ?? 1
                }
              })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        {/* Brillo */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
            <span>Brillo</span>
            <span className="text-white font-mono">
              {Math.round((selectedEntity.filters?.brightness ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={selectedEntity.filters?.brightness ?? 1}
            onChange={(e) =>
              handleUpdate({
                filters: {
                  hue: selectedEntity.filters?.hue ?? 0,
                  saturation: selectedEntity.filters?.saturation ?? 1,
                  brightness: parseFloat(e.target.value) || 1
                }
              })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>
      </div>
      )}

      {/* Animaciones (Giro, Temblor, Vaivén) */}
      <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-3">
        <div className="flex items-center gap-1.5 font-semibold text-purple-400">
          <Sparkles className="w-4 h-4" />
          <span>Animaciones Continuas</span>
        </div>

        {/* Giro continuo */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Rotación continua</span>
            <input
              type="checkbox"
              checked={selectedEntity.animations?.rotation?.enabled ?? false}
              onChange={(e) =>
                handleUpdate({
                  animations: {
                    ...selectedEntity.animations,
                    rotation: {
                      enabled: e.target.checked,
                      speed: selectedEntity.animations?.rotation?.speed ?? 0.2,
                      direction: selectedEntity.animations?.rotation?.direction ?? 'cw',
                      isVps: true
                    }
                  }
                })
              }
              className="accent-purple-500 rounded cursor-pointer"
            />
          </div>
          {selectedEntity.animations?.rotation?.enabled && (
            <div className="space-y-1.5 pl-2 border-l border-purple-500/40">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Sentido</span>
                <button
                  onClick={() =>
                    handleUpdate({
                      animations: {
                        ...selectedEntity.animations,
                        rotation: {
                          ...selectedEntity.animations!.rotation!,
                          direction: selectedEntity.animations?.rotation?.direction === 'cw' ? 'ccw' : 'cw',
                          isVps: true
                        }
                      }
                    })
                  }
                  className="px-2 py-0.5 bg-slate-700 rounded text-[11px] text-white"
                >
                  {selectedEntity.animations?.rotation?.direction === 'cw' ? 'Horario (CW)' : 'Antihorario (CCW)'}
                </button>
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Velocidad</span>
                  <span className="text-white font-mono">
                    {(Number(selectedEntity.animations?.rotation?.speed) || 0.2).toFixed(2)} v/s
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="2"
                  step="0.05"
                  value={selectedEntity.animations?.rotation?.speed ?? 0.2}
                  onChange={(e) =>
                    handleUpdate({
                      animations: {
                        ...selectedEntity.animations,
                        rotation: {
                          ...selectedEntity.animations!.rotation!,
                          speed: parseFloat(e.target.value) || 0.2,
                          isVps: true
                        }
                      }
                    })
                  }
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Temblor */}
        <div className="space-y-1.5 pt-1.5 border-t border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Temblor (Shake)</span>
            <input
              type="checkbox"
              checked={selectedEntity.animations?.shake?.enabled ?? false}
              onChange={(e) =>
                handleUpdate({
                  animations: {
                    ...selectedEntity.animations,
                    shake: {
                      enabled: e.target.checked,
                      intensity: selectedEntity.animations?.shake?.intensity ?? 3,
                      speed: selectedEntity.animations?.shake?.speed ?? 15
                    }
                  }
                })
              }
              className="accent-purple-500 rounded cursor-pointer"
            />
          </div>
          {selectedEntity.animations?.shake?.enabled && (
            <div className="space-y-1.5 pl-2 border-l border-purple-500/40">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Intensidad (px)</span>
                  <span className="text-white font-mono">{selectedEntity.animations?.shake?.intensity ?? 3} px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={selectedEntity.animations?.shake?.intensity ?? 3}
                  onChange={(e) =>
                    handleUpdate({
                      animations: {
                        ...selectedEntity.animations,
                        shake: {
                          ...selectedEntity.animations!.shake!,
                          intensity: parseInt(e.target.value) || 1
                        }
                      }
                    })
                  }
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Vaivén / Sway */}
        <div className="space-y-1.5 pt-1.5 border-t border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Vaivén (Sway)</span>
            <input
              type="checkbox"
              checked={selectedEntity.animations?.sway?.enabled ?? false}
              onChange={(e) =>
                handleUpdate({
                  animations: {
                    ...selectedEntity.animations,
                    sway: {
                      enabled: e.target.checked,
                      distanceInSquares: selectedEntity.animations?.sway?.distanceInSquares ?? 1,
                      speed: selectedEntity.animations?.sway?.speed ?? 1,
                      direction: typeof selectedEntity.animations?.sway?.direction === 'number'
                        ? selectedEntity.animations.sway.direction
                        : 0
                    }
                  }
                })
              }
              className="accent-purple-500 rounded cursor-pointer"
            />
          </div>
          {selectedEntity.animations?.sway?.enabled && (
            <div className="space-y-1.5 pl-2 border-l border-purple-500/40">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Dirección</span>
                <button
                  onClick={() =>
                    handleUpdate({
                      animations: {
                        ...selectedEntity.animations,
                        sway: {
                          ...selectedEntity.animations!.sway!,
                          direction: (selectedEntity.animations?.sway?.direction ?? 0) === 0 ? 90 : 0
                        }
                      }
                    })
                  }
                  className="px-2 py-0.5 bg-slate-700 rounded text-[11px] text-white capitalize"
                >
                  {(selectedEntity.animations?.sway?.direction ?? 0) === 0 ? 'Horizontal' : 'Vertical'}
                </button>
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Distancia</span>
                  <span className="text-white font-mono">
                    {selectedEntity.animations?.sway?.distanceInSquares ?? 1} casillas
                  </span>
                </div>
                <input
                  type="number"
                  min="0.2"
                  max="20"
                  step="0.5"
                  value={selectedEntity.animations?.sway?.distanceInSquares ?? 1}
                  onChange={(e) =>
                    handleUpdate({
                      animations: {
                        ...selectedEntity.animations,
                        sway: {
                          ...selectedEntity.animations!.sway!,
                          distanceInSquares: parseFloat(e.target.value) || 1
                        }
                      }
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chroma Key para Tokens, Objetos, Mapas o Efectos */}
      {selectedEntity.type !== 'wall' && selectedEntity.type !== 'door' && selectedEntity.type !== 'light' && (
        <div className="bg-slate-800/60 p-3 rounded border border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Pipette className="w-4 h-4" />
              <span>Chroma Key (Fondo transparente)</span>
            </span>
            <input
              type="checkbox"
              checked={selectedEntity.chromaKey?.enabled ?? false}
              onChange={(e) =>
                handleUpdate({
                  chromaKey: {
                    enabled: e.target.checked,
                    color: selectedEntity.chromaKey?.color ?? '#00ff00',
                    tolerance: selectedEntity.chromaKey?.tolerance ?? 15
                  }
                })
              }
              className="accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          {selectedEntity.chromaKey?.enabled && (
            <div className="space-y-2 pt-1 border-t border-slate-700/60">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Color a transparentar</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedEntity.chromaKey?.color ?? '#00ff00'}
                    onChange={(e) =>
                      handleUpdate({
                        chromaKey: {
                          ...selectedEntity.chromaKey!,
                          color: e.target.value
                        }
                      })
                    }
                    className="w-6 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <EyeDropperButton
                    onColorSelect={(hex) =>
                      handleUpdate({
                        chromaKey: {
                          ...selectedEntity.chromaKey!,
                          color: hex
                        }
                      })
                    }
                    title="Cuentagotas: hacer clic en el color a eliminar"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Tolerancia</span>
                  <span className="text-white font-mono">
                    {Math.round(selectedEntity.chromaKey?.tolerance ?? 15)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={selectedEntity.chromaKey?.tolerance ?? 15}
                  onChange={(e) =>
                    handleUpdate({
                      chromaKey: {
                        ...selectedEntity.chromaKey!,
                        tolerance: parseInt(e.target.value) || 0
                      }
                    })
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón eliminar */}
      <div className="pt-2 border-t border-slate-700">
        <button
          onClick={handleDelete}
          className="w-full py-1.5 px-3 bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 rounded font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar entidad</span>
        </button>
      </div>
    </div>
  );
};
