import React from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { Lock, Unlock, Eye, EyeOff, Trash2, Shield, Users, Crosshair, BrickWall } from 'lucide-react';
import { TokenSide } from '../../../types/entity';

export const PropertiesTab: React.FC = () => {
  const game = useGameStore((s) => s.game);
  const updateEntity = useGameStore((s) => s.updateEntity);
  const removeEntities = useGameStore((s) => s.removeEntities);

  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const selectedEntity = game.entities.find((e) => selectedEntityIds.includes(e.id));

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
            {selectedEntity.type === 'map' ? 'Mapa' : selectedEntity.type === 'token' ? 'Token' : selectedEntity.type === 'wall' ? 'Pared Invisible' : 'Objeto'}
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
                  onClick={() => handleUpdate({ side })}
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
