import React from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { Lock, Unlock, Eye, EyeOff, Map as MapIcon, User, Box, ArrowUp, ArrowDown, Trash2, BrickWall, Sparkles, DoorClosed, Flame } from 'lucide-react';
import { syncChannel } from '../../../modules/sync/syncChannel';
import { useShallow } from 'zustand/react/shallow';

export const LayersTab: React.FC = () => {
  const entities = useGameStore(
    useShallow((s) => s.game.entities)
  );
  const toggleEntityLock = useGameStore((s) => s.toggleEntityLock);
  const toggleEntityVisibility = useGameStore((s) => s.toggleEntityVisibility);
  const reorderEntity = useGameStore((s) => s.reorderEntity);
  const removeEntities = useGameStore((s) => s.removeEntities);

  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const clearSelection = useUIStore((s) => s.clearSelection);

  // Mostrar entidades en orden inverso (mayor zIndex arriba)
  const reversedEntities = [...entities].reverse();

  if (entities.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        <p className="font-medium text-slate-300">Tablero vacío</p>
        <p className="text-xs mt-1 text-slate-500">
          Importa mapas o arrastra tokens desde la biblioteca para comenzar.
        </p>
      </div>
    );
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'map':
        return <MapIcon className="w-3.5 h-3.5 text-amber-400" />;
      case 'token':
        return <User className="w-3.5 h-3.5 text-sky-400" />;
      case 'effect':
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      case 'door':
        return <DoorClosed className="w-3.5 h-3.5 text-amber-500" />;
      case 'light':
        return <Flame className="w-3.5 h-3.5 text-orange-400" />;
      case 'wall':
        return <BrickWall className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Box className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="p-3 text-xs text-slate-200 overflow-y-auto max-h-full space-y-1.5">
      <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-700/80 text-slate-400 font-semibold text-[11px]">
        <span>Entidades ({entities.length})</span>
        <button
          onClick={clearSelection}
          className="text-slate-500 hover:text-slate-300 text-[10px]"
        >
          Deseleccionar
        </button>
      </div>

      <div className="space-y-1">
        {reversedEntities.map((entity, index) => {
          const isSelected = selectedEntityIds.includes(entity.id);
          const originalIndex = entities.length - 1 - index;

          return (
            <div
              key={entity.id}
              onClick={() => selectEntity(entity.id)}
              className={`p-2 rounded border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-950/70 border-sky-500 text-white shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 hover:bg-slate-750 text-slate-300'
              }`}
            >
              {/* Icono y Nombre */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getEntityIcon(entity.type)}
                <span className="truncate font-medium text-xs">{entity.name}</span>
              </div>

              {/* Acciones: Ojo, Candado, Reordenar, Borrar */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {/* Reordenar capa */}
                <button
                  onClick={() => reorderEntity(entity.id, Math.min(originalIndex + 1, entities.length - 1))}
                  disabled={originalIndex === entities.length - 1}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                  title="Subir nivel de capa"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => reorderEntity(entity.id, Math.max(originalIndex - 1, 0))}
                  disabled={originalIndex === 0}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                  title="Bajar nivel de capa"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>

                {/* Candado */}
                <button
                  onClick={() => toggleEntityLock(entity.id)}
                  className={`p-1 rounded transition-colors ${
                    entity.locked ? 'text-red-400 hover:text-red-300' : 'text-slate-400 hover:text-white'
                  }`}
                  title={entity.locked ? 'Bloqueado' : 'Desbloqueado'}
                >
                  {entity.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                {/* Ojo */}
                <button
                  onClick={() => toggleEntityVisibility(entity.id)}
                  className={`p-1 rounded transition-colors ${
                    entity.visibleToPlayers ? 'text-sky-400 hover:text-sky-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={entity.visibleToPlayers ? 'Visible para jugadores' : 'Oculto para jugadores'}
                >
                  {entity.visibleToPlayers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                {/* Borrar */}
                <button
                  onClick={() => {
                    removeEntities([entity.id]);
                    if (isSelected) clearSelection();
                  }}
                  className="p-1 text-slate-500 hover:text-red-400"
                  title="Eliminar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
