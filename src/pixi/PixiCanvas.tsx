import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixiRenderer } from './PixiRenderer';
import { useGameStore } from '../stores/useGameStore';
import { useUIStore } from '../stores/useUIStore';
import { screenToWorld, snapPointToGrid } from './utils/coordinates';
import { Entity, Point2D } from '../types/entity';

interface PixiCanvasProps {
  isMaster: boolean;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ isMaster }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PixiRenderer | null>(null);

  // Stores
  const game = useGameStore((s) => s.game);
  const setMasterCamera = useGameStore((s) => s.setMasterCamera);
  const setPlayerCamera = useGameStore((s) => s.setPlayerCamera);
  const updateEntity = useGameStore((s) => s.updateEntity);
  const addEntity = useGameStore((s) => s.addEntity);

  const activeTool = useUIStore((s) => s.activeTool);
  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const ruler = useUIStore((s) => s.ruler);
  const startRulerMeasure = useUIStore((s) => s.startRulerMeasure);
  const updateRulerMeasure = useUIStore((s) => s.updateRulerMeasure);
  const endRulerMeasure = useUIStore((s) => s.endRulerMeasure);
  const showDebugVttOverlay = useUIStore((s) => s.showDebugVttOverlay);

  // Estado de interacción de ratón
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const interactionState = useRef<{
    isPanning: boolean;
    isDraggingEntity: boolean;
    isTransforming: 'rotate' | 'scale' | null;
    dragEntityId: string | null;
    startMouse: Point2D;
    startEntityPos: Point2D;
    startEntityRotation: number;
    startEntityScale: { x: number; y: number };
    startCamera: Point2D;
  }>({
    isPanning: false,
    isDraggingEntity: false,
    isTransforming: null,
    dragEntityId: null,
    startMouse: { x: 0, y: 0 },
    startEntityPos: { x: 0, y: 0 },
    startEntityRotation: 0,
    startEntityScale: { x: 1, y: 1 },
    startCamera: { x: 0, y: 0 }
  });

  // 1. Inicialización robusta de PixiRenderer compatible con React StrictMode
  useEffect(() => {
    if (!containerRef.current) return;

    let isCancelled = false;
    const container = containerRef.current;
    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full touch-none';

    const renderer = new PixiRenderer(isMaster);
    rendererRef.current = renderer;

    renderer.init(canvas, container).then(() => {
      if (isCancelled) {
        renderer.destroy();
        return;
      }

      container.replaceChildren(canvas);
      renderer.sync(game, ruler, selectedEntityIds, showDebugVttOverlay);
    }).catch((err) => {
      console.error('[PixiCanvas] Error al inicializar PixiRenderer:', err);
    });

    return () => {
      isCancelled = true;
      renderer.destroy();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [isMaster]);

  // 2. Sincronización continua de estado con PixiRenderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.sync(game, ruler, selectedEntityIds, showDebugVttOverlay);
    }
  }, [game, ruler, selectedEntityIds, showDebugVttOverlay]);

  // 3. Atajos de teclado para la barra espaciadora (Paneo temporal)
  useEffect(() => {
    if (!isMaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          setIsSpacePressed(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMaster]);

  // Funciones auxiliares de cámara y coordenadas
  const getCamera = useCallback(() => {
    return isMaster ? game.masterCamera : game.playerCamera;
  }, [isMaster, game.masterCamera, game.playerCamera]);

  const setCamera = useCallback(
    (cam: Partial<{ x: number; y: number; zoom: number }>) => {
      if (isMaster) {
        setMasterCamera(cam);
      } else {
        setPlayerCamera(cam);
      }
    },
    [isMaster, setMasterCamera, setPlayerCamera]
  );

  const getCanvasDimensions = () => {
    return {
      width: containerRef.current?.clientWidth || window.innerWidth,
      height: containerRef.current?.clientHeight || window.innerHeight
    };
  };

  // 4. Manejo de zoom con rueda del ratón centrado en el puntero
  const handleWheel = (e: React.WheelEvent) => {
    if (!isMaster) return; // En la ventana de jugadores el máster controla la cámara
    e.preventDefault();

    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const mousePos = { x: e.clientX, y: e.clientY };

    const worldBefore = screenToWorld(mousePos, camera, width, height);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(camera.zoom * zoomFactor, 0.05), 8.0);

    // Ajustar posición de la cámara para que el punto bajo el ratón quede fijo
    const newCamX = worldBefore.x - (mousePos.x - width / 2) / newZoom;
    const newCamY = worldBefore.y - (mousePos.y - height / 2) / newZoom;

    setCamera({ x: newCamX, y: newCamY, zoom: newZoom });
  };

  // 5. Manejo de clics e interacciones de ratón
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMaster) return;

    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const worldPos = screenToWorld({ x: e.clientX, y: e.clientY }, camera, width, height);

    // Paneo con botón central (botón 1) o barra espaciadora pulsada o herramienta Paneo
    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      interactionState.current.isPanning = true;
      interactionState.current.startMouse = { x: e.clientX, y: e.clientY };
      interactionState.current.startCamera = { x: camera.x, y: camera.y };
      return;
    }

    if (e.button !== 0) return; // Solo clic izquierdo para el resto de acciones

    // Herramienta Regla
    if (activeTool === 'ruler') {
      startRulerMeasure(worldPos);
      return;
    }

    // Herramienta Seleccionar
    if (activeTool === 'select') {
      // 1. Si hay una entidad seleccionada y no bloqueada, comprobar si se pincha en manija de rotación o escalado
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (selectedEntity) {
        // Comprobar manija de rotación (arriba de la entidad)
        const rotHandleLocalDist = selectedEntity.type === 'map' ? 30 : 50;
        const rotHandleWorld = {
          x: selectedEntity.x + Math.sin(selectedEntity.rotation) * rotHandleLocalDist * selectedEntity.scaleY,
          y: selectedEntity.y - Math.cos(selectedEntity.rotation) * rotHandleLocalDist * selectedEntity.scaleY
        };
        const distToRotHandle = Math.hypot(worldPos.x - rotHandleWorld.x, worldPos.y - rotHandleWorld.y);
        if (distToRotHandle < 20 / camera.zoom) {
          interactionState.current.isTransforming = 'rotate';
          interactionState.current.dragEntityId = selectedEntity.id;
          interactionState.current.startMouse = { x: e.clientX, y: e.clientY };
          interactionState.current.startEntityRotation = selectedEntity.rotation;
          return;
        }
      }

      // 2. Buscar entidad bajo el cursor (orden descendente por zIndex)
      const sortedEntities = [...game.entities].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
      const hitEntity = sortedEntities.find((ent) => {
        // No seleccionar entidades bloqueadas por accidente en el tablero
        if (ent.locked) return false;

        if (ent.type === 'map') {
          const mapW = (ent.mapData?.gridWidth ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleX;
          const mapH = (ent.mapData?.gridHeight ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleY;
          return worldPos.x >= ent.x && worldPos.x <= ent.x + mapW && worldPos.y >= ent.y && worldPos.y <= ent.y + mapH;
        }

        // Token u objeto
        const radius = (ent.type === 'token' ? 35 : 45) * Math.max(ent.scaleX, ent.scaleY);
        const dist = Math.hypot(worldPos.x - ent.x, worldPos.y - ent.y);
        return dist <= radius;
      });

      if (hitEntity) {
        selectEntity(hitEntity.id, e.shiftKey);
        interactionState.current.isDraggingEntity = true;
        interactionState.current.dragEntityId = hitEntity.id;
        interactionState.current.startMouse = worldPos;
        interactionState.current.startEntityPos = { x: hitEntity.x, y: hitEntity.y };
      } else {
        if (!e.shiftKey) {
          clearSelection();
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMaster) return;

    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const worldPos = screenToWorld({ x: e.clientX, y: e.clientY }, camera, width, height);

    // 1. Paneo de cámara
    if (interactionState.current.isPanning) {
      const dx = (e.clientX - interactionState.current.startMouse.x) / camera.zoom;
      const dy = (e.clientY - interactionState.current.startMouse.y) / camera.zoom;
      setCamera({
        x: interactionState.current.startCamera.x - dx,
        y: interactionState.current.startCamera.y - dy
      });
      return;
    }

    // 2. Medición de regla
    if (activeTool === 'ruler' && ruler.measuring) {
      updateRulerMeasure(worldPos);
      return;
    }

    // 3. Rotación con Gizmo
    if (interactionState.current.isTransforming === 'rotate' && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        const angle = Math.atan2(worldPos.y - entity.y, worldPos.x - entity.x) + Math.PI / 2;
        updateEntity(entity.id, { rotation: angle }, false);
      }
      return;
    }

    // 4. Arrastre y movimiento de entidad
    if (interactionState.current.isDraggingEntity && interactionState.current.dragEntityId) {
      const dx = worldPos.x - interactionState.current.startMouse.x;
      const dy = worldPos.y - interactionState.current.startMouse.y;
      const newX = interactionState.current.startEntityPos.x + dx;
      const newY = interactionState.current.startEntityPos.y + dy;

      updateEntity(
        interactionState.current.dragEntityId,
        {
          x: newX,
          y: newY
        },
        false // No registrar cada frame intermedio en el historial
      );
    }
  };

  const handlePointerUp = () => {
    if (!isMaster) return;

    // Si estábamos arrastrando una entidad y snapToGrid está activo, ajustar posición al soltar
    if (interactionState.current.isDraggingEntity && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        let finalX = entity.x;
        let finalY = entity.y;

        if (game.grid.snapToGrid && game.grid.size > 0) {
          if (entity.type === 'map') {
            // El origen del mapa se ajusta a una intersección de la cuadrícula
            const snapped = snapPointToGrid({ x: entity.x, y: entity.y }, game.grid.size);
            finalX = snapped.x;
            finalY = snapped.y;
          } else {
            // Los tokens se ajustan al centro o intersección
            const halfGrid = game.grid.size / 2;
            const snapped = snapPointToGrid({ x: entity.x - halfGrid, y: entity.y - halfGrid }, game.grid.size);
            finalX = snapped.x + halfGrid;
            finalY = snapped.y + halfGrid;
          }
        }

        updateEntity(entity.id, { x: finalX, y: finalY }, true); // Guardar en historial
      }
    }

    // Si estábamos rotando, registrar cambio definitivo en historial
    if (interactionState.current.isTransforming === 'rotate' && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        updateEntity(entity.id, { rotation: entity.rotation }, true);
      }
    }

    if (activeTool === 'ruler') {
      endRulerMeasure();
    }

    interactionState.current.isPanning = false;
    interactionState.current.isDraggingEntity = false;
    interactionState.current.isTransforming = null;
    interactionState.current.dragEntityId = null;
  };

  // 6. Soltar asset desde la biblioteca al tablero (Drag & Drop)
  const handleDragOver = (e: React.DragEvent) => {
    if (!isMaster) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isMaster) return;
    e.preventDefault();

    const data = e.dataTransfer.getData('application/vtt-asset');
    if (!data) return;

    try {
      const asset = JSON.parse(data);
      const { width, height } = getCanvasDimensions();
      const camera = getCamera();
      let worldPos = screenToWorld({ x: e.clientX, y: e.clientY }, camera, width, height);

      if (game.grid.snapToGrid && game.grid.size > 0) {
        worldPos = snapPointToGrid(worldPos, game.grid.size);
      }

      const entityType = asset.type === 'map' ? 'map' : 'token';

      // Calcular escala inicial:
      // Para mapas: grid.size / pixelsPerGrid para encajar exactamente con la cuadrícula
      let scale = 1;
      if (entityType === 'map' && asset.mapData?.pixelsPerGrid) {
        scale = game.grid.size / asset.mapData.pixelsPerGrid;
      }

      const newEntity: Entity = {
        id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: entityType,
        name: asset.name,
        assetId: asset.id,
        x: worldPos.x,
        y: worldPos.y,
        rotation: 0,
        scaleX: scale,
        scaleY: scale,
        zIndex: entityType === 'map' ? 0 : 10,
        visibleToPlayers: true,
        locked: false,
        mapData: asset.mapData,
        side: entityType === 'token' ? 'jugador' : undefined,
        statuses: []
      };

      addEntity(newEntity);
      selectEntity(newEntity.id);
    } catch (err) {
      console.error('Error al soltar asset en el tablero:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${
        isSpacePressed || interactionState.current.isPanning
          ? 'cursor-grab active:cursor-grabbing'
          : activeTool === 'ruler'
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
};
