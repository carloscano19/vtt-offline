import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, Sparkles } from 'lucide-react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { worldToScreen, localToWorld } from '../../../pixi/utils/coordinates';

interface FastActionBarProps {
  selectedEntityId: string;
  canvasWidth: number;
  canvasHeight: number;
}

export const FastActionBar: React.FC<FastActionBarProps> = ({
  selectedEntityId,
  canvasWidth,
  canvasHeight
}) => {
  const entity = useGameStore((s) => s.game.entities.find((e) => e.id === selectedEntityId));
  const camera = useGameStore((s) => s.game.masterCamera);
  const allEntities = useGameStore((s) => s.game.entities);
  const updateEntity = useGameStore((s) => s.updateEntity);
  const toggleEntityLock = useGameStore((s) => s.toggleEntityLock);
  const duplicateEntity = useGameStore((s) => s.duplicateEntity);
  const removeEntities = useGameStore((s) => s.removeEntities);
  const setEditingTokenStatusesId = useUIStore((s) => s.setEditingTokenStatusesId);
  const addToast = useUIStore((s) => s.addToast);

  if (!entity || entity.type === 'wall') return null;

  // Calcular centro y rotación teniendo en cuenta el mapa padre si aplica
  let worldCenter = { x: entity.x, y: entity.y };
  let worldRot = entity.rotation || 0;

  if (entity.mapId) {
    const parentMap = allEntities.find((e) => e.id === entity.mapId);
    if (parentMap) {
      worldCenter = localToWorld(
        { x: entity.x, y: entity.y },
        { x: parentMap.x, y: parentMap.y },
        parentMap.rotation,
        parentMap.scaleX,
        parentMap.scaleY
      );
      worldRot = (entity.rotation || 0) + parentMap.rotation;
    }
  }

  // Estimar dimensiones en espacio local según el tipo de entidad
  let halfW = 35 * Math.abs(entity.scaleX || 1);
  let halfH = 35 * Math.abs(entity.scaleY || 1);

  if (entity.type === 'door' && entity.door) {
    halfW = ((entity.door.length ?? 70) * Math.abs(entity.scaleX || 1)) / 2;
    halfH = 12 * Math.abs(entity.scaleY || 1);
  }

  const cosR = Math.cos(worldRot);
  const sinR = Math.sin(worldRot);

  const localCorners = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH }
  ];

  const worldCorners = localCorners.map((c) => ({
    x: worldCenter.x + (c.x * cosR - c.y * sinR),
    y: worldCenter.y + (c.x * sinR + c.y * cosR)
  }));

  const screenCorners = worldCorners.map((pt) =>
    worldToScreen(pt, camera, canvasWidth, canvasHeight)
  );

  const minScreenY = Math.min(...screenCorners.map((p) => p.y));
  const minScreenX = Math.min(...screenCorners.map((p) => p.x));
  const maxScreenX = Math.max(...screenCorners.map((p) => p.x));
  const centerScreenX = (minScreenX + maxScreenX) / 2;

  // Ajustar posición en pantalla por encima del gizmo
  const leftClamped = Math.max(90, Math.min(canvasWidth - 90, centerScreenX));
  const topClamped = Math.max(50, minScreenY - 14);

  const isVisible = entity.visibleToPlayers !== false;
  const isLocked = !!entity.locked;
  const isToken = entity.type === 'token';
  const statusCount = isToken && Array.isArray(entity.statuses) ? entity.statuses.length : 0;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateEntity(entity.id, { visibleToPlayers: !isVisible }, true);
  };

  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEntityLock(entity.id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = duplicateEntity(entity.id);
    if (newId) {
      addToast('Entidad duplicada', 'info', 2000);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEntities([entity.id]);
  };

  const handleOpenStatuses = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTokenStatusesId(entity.id);
  };

  return (
    <div
      className="absolute flex items-center gap-0.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg p-1 shadow-2xl text-slate-200 z-40 select-none animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: `${Math.round(leftClamped)}px`,
        top: `${Math.round(topClamped)}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto'
      }}
      onPointerDown={handlePointerDown}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Botón Ojo (Visibilidad en la tele de los jugadores) */}
      <button
        type="button"
        onClick={handleToggleVisibility}
        className={`p-1.5 rounded-md transition-colors ${
          isVisible
            ? 'text-slate-300 hover:text-white hover:bg-slate-800'
            : 'text-amber-400 bg-amber-950/50 hover:bg-amber-900/60'
        }`}
        title={isVisible ? 'Visible para jugadores (clic para ocultar)' : 'Oculto para jugadores (clic para mostrar)'}
      >
        {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>

      {/* Botón Candado (Bloquear posición/rotación) */}
      <button
        type="button"
        onClick={handleToggleLock}
        className={`p-1.5 rounded-md transition-colors ${
          isLocked
            ? 'text-rose-400 bg-rose-950/50 hover:bg-rose-900/60'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
        title={isLocked ? 'Bloqueado (clic para desbloquear)' : 'Desbloqueado (clic para bloquear)'}
      >
        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </button>

      {/* Botón Duplicar */}
      <button
        type="button"
        onClick={handleDuplicate}
        className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        title="Duplicar entidad"
      >
        <Copy className="w-4 h-4" />
      </button>

      {/* Botón Borrar */}
      <button
        type="button"
        onClick={handleDelete}
        className="p-1.5 rounded-md text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
        title="Eliminar entidad"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Botón Estados (Solo tokens) */}
      {isToken && (
        <>
          <div className="w-[1px] h-4 bg-slate-700/80 mx-0.5" />
          <button
            type="button"
            onClick={handleOpenStatuses}
            className={`p-1.5 rounded-md flex items-center gap-1 transition-colors ${
              statusCount > 0
                ? 'text-amber-300 bg-amber-950/60 hover:bg-amber-900/70 border border-amber-600/40'
                : 'text-slate-300 hover:text-amber-300 hover:bg-slate-800'
            }`}
            title={`Estados y condiciones (${statusCount} activos)`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            {statusCount > 0 && (
              <span className="text-[11px] font-bold font-mono px-1 rounded bg-amber-500 text-slate-950 leading-tight">
                {statusCount}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );
};
