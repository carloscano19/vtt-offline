import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, Sparkles } from 'lucide-react';
import { useGameStore } from '../../../stores/useGameStore';
import { useUIStore } from '../../../stores/useUIStore';
import { worldToScreen, localToWorld } from '../../../pixi/utils/coordinates';

import type { PixiRenderer } from '../../../pixi/PixiRenderer';

interface FastActionBarProps {
  selectedEntityId: string;
  canvasWidth: number;
  canvasHeight: number;
  renderer?: PixiRenderer | null;
}

export const FastActionBar: React.FC<FastActionBarProps> = ({
  selectedEntityId,
  canvasWidth,
  canvasHeight,
  renderer
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

  // Obtener dimensiones locales exactas desde el Gizmo o fallback
  let localBounds = {
    offsetX: -35,
    offsetY: -35,
    width: 70,
    height: 70
  };

  if (renderer?.gizmoLayer) {
    localBounds = renderer.gizmoLayer.getEntityLocalBounds(entity);
  } else if (entity.type === 'door' && entity.door) {
    const w = entity.door.length ?? 70;
    const h = 12;
    localBounds = { offsetX: -w / 2, offsetY: -h / 2, width: w, height: h };
  }

  const { offsetX, offsetY, width, height } = localBounds;
  const sx = entity.scaleX || 1;
  const sy = entity.scaleY || 1;
  const absSy = Math.max(0.001, Math.abs(sy));

  const cosR = Math.cos(worldRot);
  const sinR = Math.sin(worldRot);

  // Esquinas de la caja delimitadora en espacio local escalado
  const localCorners = [
    { x: offsetX * sx, y: offsetY * sy },
    { x: (offsetX + width) * sx, y: offsetY * sy },
    { x: (offsetX + width) * sx, y: (offsetY + height) * sy },
    { x: offsetX * sx, y: (offsetY + height) * sy }
  ];

  // Si no está bloqueada, incluir la manija de rotación del gizmo (que sobresale por arriba)
  if (!entity.locked) {
    const zoom = Math.max(0.01, camera.zoom);
    const handleDist = 26 / (zoom * absSy);
    const rotHandleY = offsetY - handleDist;
    const centerX = offsetX + width / 2;
    // La manija tiene un círculo de radio 5px + margen de 2px en pantalla
    const rotRadiusLocal = 7 / (zoom * absSy);
    localCorners.push(
      { x: centerX * sx, y: (rotHandleY - rotRadiusLocal) * sy },
      { x: centerX * sx, y: (rotHandleY + rotRadiusLocal) * sy }
    );
  }

  const worldCorners = localCorners.map((c) => ({
    x: worldCenter.x + (c.x * cosR - c.y * sinR),
    y: worldCenter.y + (c.x * sinR + c.y * cosR)
  }));

  const screenCorners = worldCorners.map((pt) =>
    worldToScreen(pt, camera, canvasWidth, canvasHeight)
  );

  const minScreenY = Math.min(...screenCorners.map((p) => p.y));
  const maxScreenY = Math.max(...screenCorners.map((p) => p.y));
  const minScreenX = Math.min(...screenCorners.map((p) => p.x));
  const maxScreenX = Math.max(...screenCorners.map((p) => p.x));
  const centerScreenX = (minScreenX + maxScreenX) / 2;

  // Altura aproximada de la barra rápida
  const BAR_HEIGHT = 42;
  const TOP_TOOLBAR_HEIGHT = 56;
  // Colocar por encima del gizmo (incluida la manija de rotación) con 8px de separación.
  // Si no cabe arriba (chocaría con el borde superior / toolbar), colocar debajo con 8px.
  const fitsAbove = minScreenY - 8 - BAR_HEIGHT >= TOP_TOOLBAR_HEIGHT;

  const leftClamped = Math.max(110, Math.min(canvasWidth - 110, centerScreenX));
  const topClamped = fitsAbove
    ? Math.max(TOP_TOOLBAR_HEIGHT + BAR_HEIGHT, minScreenY - 8)
    : Math.min(canvasHeight - BAR_HEIGHT - 12, maxScreenY + 8);
  const transformStyle = fitsAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

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
        transform: transformStyle,
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
