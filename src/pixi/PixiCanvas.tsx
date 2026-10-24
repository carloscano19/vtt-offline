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
      // 1. Si hay una entidad seleccionada y no bloqueada, comprobar manijas del Gizmo (rotación o escalado)
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (selectedEntity) {
        let bW = 70;
        let bH = 70;
        let offX = -35;
        let offY = -35;

        if (selectedEntity.type === 'map') {
          bW = (selectedEntity.mapData?.gridWidth ?? 10) * (selectedEntity.mapData?.pixelsPerGrid ?? 70);
          bH = (selectedEntity.mapData?.gridHeight ?? 10) * (selectedEntity.mapData?.pixelsPerGrid ?? 70);
          offX = 0;
          offY = 0;
        } else if (rendererRef.current?.tokensLayer) {
          const tBounds = rendererRef.current.tokensLayer.getEntityBounds(selectedEntity.id);
          if (tBounds) {
            bW = tBounds.width;
            bH = tBounds.height;
            offX = -bW / 2;
            offY = -bH / 2;
          }
        }

        const cosR = Math.cos(selectedEntity.rotation);
        const sinR = Math.sin(selectedEntity.rotation);

        const localToWorld = (lx: number, ly: number) => {
          const scaledX = lx * selectedEntity.scaleX;
          const scaledY = ly * selectedEntity.scaleY;
          return {
            x: selectedEntity.x + (scaledX * cosR - scaledY * sinR),
            y: selectedEntity.y + (scaledX * sinR + scaledY * cosR)
          };
        };

        // Comprobar manija de rotación (arriba de la caja)
        const rotDistLocal = 25 / Math.abs(selectedEntity.scaleY || 1);
        const rotLocalX = offX + bW / 2;
        const rotLocalY = offY - rotDistLocal;
        const rotWorld = localToWorld(rotLocalX, rotLocalY);

        if (Math.hypot(worldPos.x - rotWorld.x, worldPos.y - rotWorld.y) < 18 / camera.zoom) {
          interactionState.current.isTransforming = 'rotate';
          interactionState.current.dragEntityId = selectedEntity.id;
          interactionState.current.startMouse = { x: e.clientX, y: e.clientY };
          interactionState.current.startEntityRotation = selectedEntity.rotation;
          return;
        }

        // Comprobar manijas de esquina para escalado
        const corners = [
          { x: offX, y: offY },
          { x: offX + bW, y: offY },
          { x: offX + bW, y: offY + bH },
          { x: offX, y: offY + bH }
        ];

        let hitCorner = false;
        for (const c of corners) {
          const cornerWorld = localToWorld(c.x, c.y);
          if (Math.hypot(worldPos.x - cornerWorld.x, worldPos.y - cornerWorld.y) < 18 / camera.zoom) {
            interactionState.current.isTransforming = 'scale';
            interactionState.current.dragEntityId = selectedEntity.id;
            interactionState.current.startMouse = { x: e.clientX, y: e.clientY };
            interactionState.current.startEntityScale = { x: selectedEntity.scaleX, y: selectedEntity.scaleY };
            hitCorner = true;
            break;
          }
        }
        if (hitCorner) return;
      }

      // 2. Buscar entidad bajo el cursor (prioridad: tokens > objetos > mapas, y zIndex descendente)
      const typePriority: Record<string, number> = { token: 300, object: 200, map: 100 };
      const sortedEntities = [...game.entities].sort((a, b) => {
        const pDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
        if (pDiff !== 0) return pDiff;
        return (b.zIndex ?? 0) - (a.zIndex ?? 0);
      });

      const hitEntity = sortedEntities.find((ent) => {
        // No seleccionar entidades bloqueadas por accidente en el tablero
        if (ent.locked) return false;

        if (ent.type === 'map') {
          const mapW = (ent.mapData?.gridWidth ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleX;
          const mapH = (ent.mapData?.gridHeight ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleY;
          return worldPos.x >= ent.x && worldPos.x <= ent.x + mapW && worldPos.y >= ent.y && worldPos.y <= ent.y + mapH;
        }

        // Token u objeto: consultar radio o tamaño real
        let baseRadius = (ent.type === 'token' ? 35 : 45);
        if (rendererRef.current?.tokensLayer) {
          const tb = rendererRef.current.tokensLayer.getEntityBounds(ent.id);
          if (tb) baseRadius = tb.radius;
        }
        const effectiveRadius = Math.max(25, baseRadius * Math.max(Math.abs(ent.scaleX), Math.abs(ent.scaleY)));
        const dist = Math.hypot(worldPos.x - ent.x, worldPos.y - ent.y);
        return dist <= effectiveRadius;
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

    // 4. Escalado con Gizmo
    if (interactionState.current.isTransforming === 'scale' && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        // Distancia del puntero respecto al centro de la entidad vs distancia inicial
        const currentDist = Math.hypot(worldPos.x - entity.x, worldPos.y - entity.y);
        const startWorld = screenToWorld(interactionState.current.startMouse, camera, width, height);
        const startDist = Math.hypot(startWorld.x - entity.x, startWorld.y - entity.y);

        if (startDist > 5) {
          const ratio = Math.max(0.1, currentDist / startDist);
          const newScaleX = parseFloat((interactionState.current.startEntityScale.x * ratio).toFixed(3));
          const newScaleY = parseFloat((interactionState.current.startEntityScale.y * ratio).toFixed(3));
          updateEntity(entity.id, { scaleX: newScaleX, scaleY: newScaleY }, false);
        }
      }
      return;
    }

    // 5. Arrastre y movimiento de entidad
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

    // Si estábamos transformando (rotación o escalado), registrar cambio definitivo en historial
    if (interactionState.current.isTransforming && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        if (interactionState.current.isTransforming === 'rotate') {
          updateEntity(entity.id, { rotation: entity.rotation }, true);
        } else if (interactionState.current.isTransforming === 'scale') {
          updateEntity(entity.id, { scaleX: entity.scaleX, scaleY: entity.scaleY }, true);
        }
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
      const currentGridSize = game.grid.size || 70;

      let scale = 1;
      let finalX = worldPos.x;
      let finalY = worldPos.y;

      if (entityType === 'map') {
        const ppg = asset.mapData?.pixelsPerGrid || (asset.width ? asset.width / 10 : 70);
        scale = currentGridSize / ppg;
      } else {
        const maxDim = Math.max(asset.width || 70, asset.height || 70);
        scale = maxDim > 0 ? currentGridSize / maxDim : 1;
        // Centrar token en la celda
        const halfGrid = currentGridSize / 2;
        finalX = Math.floor(worldPos.x / currentGridSize) * currentGridSize + halfGrid;
        finalY = Math.floor(worldPos.y / currentGridSize) * currentGridSize + halfGrid;
      }

      const newEntity: Entity = {
        id: `entity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: entityType,
        name: asset.name,
        assetId: asset.id,
        x: finalX,
        y: finalY,
        rotation: 0,
        scaleX: scale,
        scaleY: scale,
        zIndex: entityType === 'map' ? 0 : 10,
        visibleToPlayers: entityType === 'map', // Mapas visibles, tokens ocultos por defecto
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
