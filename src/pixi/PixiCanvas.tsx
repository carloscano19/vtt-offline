import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixiRenderer } from './PixiRenderer';
import { useGameStore } from '../stores/useGameStore';
import { useUIStore } from '../stores/useUIStore';
import { screenToWorld, snapPointToGrid, localToWorld, worldToLocal } from './utils/coordinates';
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

  // Estado para la herramienta de Paredes invisibles
  const [draftWallPoints, setDraftWallPoints] = useState<Point2D[]>([]);
  const [hoverCursor, setHoverCursor] = useState<string>('default');

  // Estado de interacción de ratón
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const interactionState = useRef<{
    isPanning: boolean;
    isDraggingEntity: boolean;
    isTransforming: 'rotate' | 'scale' | null;
    isDraggingWallNode: boolean;
    dragWallEntityId: string | null;
    dragWallNodeIndex: number;
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
    isDraggingWallNode: false,
    dragWallEntityId: null,
    dragWallNodeIndex: -1,
    dragEntityId: null,
    startMouse: { x: 0, y: 0 },
    startEntityPos: { x: 0, y: 0 },
    startEntityRotation: 0,
    startEntityScale: { x: 1, y: 1 },
    startCamera: { x: 0, y: 0 }
  });

  // Helper para obtener coordenadas locales del puntero relativas al canvas
  const getLocalPointer = useCallback((e: { clientX: number; clientY: number }): Point2D => {
    const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

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
      renderer.sync(game, ruler, selectedEntityIds, showDebugVttOverlay, draftWallPoints);
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
      rendererRef.current.sync(game, ruler, selectedEntityIds, showDebugVttOverlay, draftWallPoints);
    }
  }, [game, ruler, selectedEntityIds, showDebugVttOverlay, draftWallPoints]);

  // Finalizar o cancelar pared con teclado
  const finishDraftWall = useCallback(() => {
    if (draftWallPoints.length < 2) {
      setDraftWallPoints([]);
      return;
    }

    // Comprobar si el primer nodo de la pared cae dentro de algún mapa para vincularlo
    const firstPt = draftWallPoints[0];
    const maps = game.entities.filter((e) => e.type === 'map');
    const containingMap = maps.find((m) => {
      const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
      const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY;
      return firstPt.x >= m.x && firstPt.x <= m.x + mW && firstPt.y >= m.y && firstPt.y <= m.y + mH;
    });

    let finalPoints = draftWallPoints;
    let mapId: string | undefined = undefined;

    if (containingMap) {
      mapId = containingMap.id;
      const mapPos = { x: containingMap.x, y: containingMap.y };
      finalPoints = draftWallPoints.map((p) =>
        worldToLocal(p, mapPos, containingMap.rotation, containingMap.scaleX, containingMap.scaleY)
      );
    }

    const wallEntity: Entity = {
      id: `wall_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'wall',
      name: `Pared ${game.entities.filter((e) => e.type === 'wall').length + 1}`,
      x: containingMap ? containingMap.x : 0,
      y: containingMap ? containingMap.y : 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 50,
      visibleToPlayers: false, // Paredes invisibles nunca visibles a jugadores
      locked: false,
      points: finalPoints,
      closed: false,
      mapId
    };

    addEntity(wallEntity);
    selectEntity(wallEntity.id);
    setDraftWallPoints([]);
  }, [draftWallPoints, game.entities, addEntity, selectEntity]);

  // 3. Atajos de teclado para la barra espaciadora, Enter y Esc
  useEffect(() => {
    if (!isMaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      } else if (e.code === 'Enter') {
        if (activeTool === 'wall') {
          e.preventDefault();
          finishDraftWall();
        }
      } else if (e.code === 'Escape') {
        if (activeTool === 'wall') {
          e.preventDefault();
          setDraftWallPoints([]);
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
  }, [isMaster, activeTool, finishDraftWall]);

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
    const mousePos = getLocalPointer(e);

    const worldBefore = screenToWorld(mousePos, camera, width, height);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(camera.zoom * zoomFactor, 0.05), 8.0);

    // Ajustar posición de la cámara para que el punto bajo el ratón quede fijo
    const newCamX = worldBefore.x - (mousePos.x - width / 2) / newZoom;
    const newCamY = worldBefore.y - (mousePos.y - height / 2) / newZoom;

    setCamera({ x: newCamX, y: newCamY, zoom: newZoom });
  };

  // Helper para calcular la posición mundial de un nodo de pared
  const getWallNodeWorldPos = useCallback(
    (wall: Entity, pt: Point2D): Point2D => {
      if (wall.mapId) {
        const parentMap = game.entities.find((e) => e.id === wall.mapId);
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(pt, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
      }
      return pt;
    },
    [game.entities]
  );

  // 5. Manejo de clics e interacciones de ratón
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMaster) return;

    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const localMouse = getLocalPointer(e);
    const worldPos = screenToWorld(localMouse, camera, width, height);

    // Paneo con botón central (botón 1) o barra espaciadora pulsada o herramienta Paneo
    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      interactionState.current.isPanning = true;
      interactionState.current.startMouse = localMouse;
      interactionState.current.startCamera = { x: camera.x, y: camera.y };
      return;
    }

    if (e.button !== 0) return; // Solo clic izquierdo para el resto de acciones

    // Herramienta Pared invisible
    if (activeTool === 'wall') {
      let ptToAdd = worldPos;
      if (game.grid.snapToGrid && game.grid.size > 0 && !e.altKey) {
        ptToAdd = snapPointToGrid(worldPos, game.grid.size);
      }

      // Si es doble clic en el mismo punto, finalizar pared
      if (
        draftWallPoints.length > 0 &&
        Math.hypot(ptToAdd.x - draftWallPoints[draftWallPoints.length - 1].x, ptToAdd.y - draftWallPoints[draftWallPoints.length - 1].y) < 5
      ) {
        finishDraftWall();
        return;
      }

      setDraftWallPoints((prev) => [...prev, ptToAdd]);
      return;
    }

    // Herramienta Regla
    if (activeTool === 'ruler') {
      startRulerMeasure(worldPos);
      return;
    }

    // Herramienta Seleccionar
    if (activeTool === 'select') {
      const handleHitRadius = Math.max(12 / camera.zoom, 14);

      // 1. Si hay una entidad seleccionada y no bloqueada, comprobar manijas del Gizmo
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (selectedEntity && selectedEntity.type !== 'wall') {
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

        const localToWorldPos = (lx: number, ly: number) => {
          const scaledX = lx * selectedEntity.scaleX;
          const scaledY = ly * selectedEntity.scaleY;
          return {
            x: selectedEntity.x + (scaledX * cosR - scaledY * sinR),
            y: selectedEntity.y + (scaledX * sinR + scaledY * cosR)
          };
        };

        // Manija de rotación (arriba de la caja)
        const rotDistLocal = 25 / Math.abs(selectedEntity.scaleY || 1);
        const rotLocalX = offX + bW / 2;
        const rotLocalY = offY - rotDistLocal;
        const rotWorld = localToWorldPos(rotLocalX, rotLocalY);

        if (Math.hypot(worldPos.x - rotWorld.x, worldPos.y - rotWorld.y) <= handleHitRadius) {
          interactionState.current.isTransforming = 'rotate';
          interactionState.current.dragEntityId = selectedEntity.id;
          interactionState.current.startMouse = localMouse;
          interactionState.current.startEntityRotation = selectedEntity.rotation;
          return;
        }

        // Manijas de esquina para escalado
        const corners = [
          { x: offX, y: offY },
          { x: offX + bW, y: offY },
          { x: offX + bW, y: offY + bH },
          { x: offX, y: offY + bH }
        ];

        let hitCorner = false;
        for (const c of corners) {
          const cornerWorld = localToWorldPos(c.x, c.y);
          if (Math.hypot(worldPos.x - cornerWorld.x, worldPos.y - cornerWorld.y) <= handleHitRadius) {
            interactionState.current.isTransforming = 'scale';
            interactionState.current.dragEntityId = selectedEntity.id;
            interactionState.current.startMouse = localMouse;
            interactionState.current.startEntityScale = { x: selectedEntity.scaleX, y: selectedEntity.scaleY };
            hitCorner = true;
            break;
          }
        }
        if (hitCorner) return;
      }

      // 2. Si hay una pared seleccionada, comprobar si se pincha en alguno de sus nodos para arrastrarlo
      if (selectedEntity && selectedEntity.type === 'wall' && selectedEntity.points) {
        for (let i = 0; i < selectedEntity.points.length; i++) {
          const nodeWorld = getWallNodeWorldPos(selectedEntity, selectedEntity.points[i]);
          if (Math.hypot(worldPos.x - nodeWorld.x, worldPos.y - nodeWorld.y) <= handleHitRadius) {
            interactionState.current.isDraggingWallNode = true;
            interactionState.current.dragWallEntityId = selectedEntity.id;
            interactionState.current.dragWallNodeIndex = i;
            interactionState.current.startMouse = worldPos;
            return;
          }
        }
      }

      // 3. Buscar entidad bajo el cursor (prioridad: tokens > objetos > paredes > mapas, y zIndex descendente)
      const typePriority: Record<string, number> = { token: 300, object: 200, wall: 150, map: 100 };
      const sortedEntities = [...game.entities].sort((a, b) => {
        const pDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
        if (pDiff !== 0) return pDiff;
        return (b.zIndex ?? 0) - (a.zIndex ?? 0);
      });

      const hitEntity = sortedEntities.find((ent) => {
        if (ent.locked) return false;

        if (ent.type === 'wall' && ent.points && ent.points.length >= 2) {
          // Comprobar cercanía a cualquier segmento de la pared
          const pts = ent.points;
          const count = ent.closed ? pts.length : pts.length - 1;
          for (let i = 0; i < count; i++) {
            const p1 = getWallNodeWorldPos(ent, pts[i]);
            const p2 = getWallNodeWorldPos(ent, pts[(i + 1) % pts.length]);
            // Distancia punto a segmento
            const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
            if (l2 === 0) continue;
            let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = p1.x + t * (p2.x - p1.x);
            const projY = p1.y + t * (p2.y - p1.y);
            if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= 12 / camera.zoom) {
              return true;
            }
          }
          return false;
        }

        if (ent.type === 'map') {
          const mapW = (ent.mapData?.gridWidth ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleX;
          const mapH = (ent.mapData?.gridHeight ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleY;
          return worldPos.x >= ent.x && worldPos.x <= ent.x + mapW && worldPos.y >= ent.y && worldPos.y <= ent.y + mapH;
        }

        // Token u objeto: consultar radio o tamaño real
        let baseRadius = ent.type === 'token' ? 35 : 45;
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
        if (hitEntity.type !== 'wall') {
          interactionState.current.isDraggingEntity = true;
          interactionState.current.dragEntityId = hitEntity.id;
          interactionState.current.startMouse = worldPos;
          interactionState.current.startEntityPos = { x: hitEntity.x, y: hitEntity.y };
        }
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
    const localMouse = getLocalPointer(e);
    const worldPos = screenToWorld(localMouse, camera, width, height);

    // 1. Paneo de cámara
    if (interactionState.current.isPanning) {
      const dx = (localMouse.x - interactionState.current.startMouse.x) / camera.zoom;
      const dy = (localMouse.y - interactionState.current.startMouse.y) / camera.zoom;
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

    // 5. Arrastre de nodo de pared
    if (interactionState.current.isDraggingWallNode && interactionState.current.dragWallEntityId) {
      const wall = game.entities.find((ent) => ent.id === interactionState.current.dragWallEntityId);
      if (wall && wall.points) {
        let newPt = worldPos;
        if (game.grid.snapToGrid && game.grid.size > 0 && !e.altKey) {
          newPt = snapPointToGrid(worldPos, game.grid.size);
        }
        if (wall.mapId) {
          const parentMap = game.entities.find((e) => e.id === wall.mapId);
          if (parentMap) {
            const mapPos = { x: parentMap.x, y: parentMap.y };
            newPt = worldToLocal(newPt, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
          }
        }
        const updatedPoints = [...wall.points];
        updatedPoints[interactionState.current.dragWallNodeIndex] = newPt;
        updateEntity(wall.id, { points: updatedPoints }, false);
      }
      return;
    }

    // 6. Arrastre y movimiento de entidad
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
        false
      );
      return;
    }

    // 7. Cálculo de cursor dinámico cuando no se está arrastrando nada
    if (activeTool === 'select') {
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      let newCursor = 'default';

      if (selectedEntity && selectedEntity.type !== 'wall') {
        const handleHitRadius = Math.max(12 / camera.zoom, 14);

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

        const localToWorldPos = (lx: number, ly: number) => {
          const scaledX = lx * selectedEntity.scaleX;
          const scaledY = ly * selectedEntity.scaleY;
          return {
            x: selectedEntity.x + (scaledX * cosR - scaledY * sinR),
            y: selectedEntity.y + (scaledX * sinR + scaledY * cosR)
          };
        };

        // Comprobar rotación
        const rotDistLocal = 25 / Math.abs(selectedEntity.scaleY || 1);
        const rotWorld = localToWorldPos(offX + bW / 2, offY - rotDistLocal);
        if (Math.hypot(worldPos.x - rotWorld.x, worldPos.y - rotWorld.y) <= handleHitRadius) {
          newCursor = 'grab';
        } else {
          // Comprobar esquinas (0: TL, 1: TR, 2: BR, 3: BL)
          const corners = [
            { x: offX, y: offY, cursor: 'nwse-resize' },
            { x: offX + bW, y: offY, cursor: 'nesw-resize' },
            { x: offX + bW, y: offY + bH, cursor: 'nwse-resize' },
            { x: offX, y: offY + bH, cursor: 'nesw-resize' }
          ];
          for (const c of corners) {
            const cw = localToWorldPos(c.x, c.y);
            if (Math.hypot(worldPos.x - cw.x, worldPos.y - cw.y) <= handleHitRadius) {
              newCursor = c.cursor;
              break;
            }
          }
        }
      }

      setHoverCursor(newCursor);
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

    // Si estábamos arrastrando un nodo de pared, registrar en historial al soltar
    if (interactionState.current.isDraggingWallNode && interactionState.current.dragWallEntityId) {
      const wall = game.entities.find((ent) => ent.id === interactionState.current.dragWallEntityId);
      if (wall && wall.points) {
        updateEntity(wall.id, { points: [...wall.points] }, true);
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
    interactionState.current.isDraggingWallNode = false;
    interactionState.current.dragWallEntityId = null;
    interactionState.current.dragWallNodeIndex = -1;
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
      const localMouse = getLocalPointer(e);
      let worldPos = screenToWorld(localMouse, camera, width, height);

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
        visibleToPlayers: entityType === 'map',
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

  // Determinar cursor CSS dinámico
  let activeCursor = 'default';
  if (isSpacePressed || interactionState.current.isPanning) {
    activeCursor = 'cursor-grab active:cursor-grabbing';
  } else if (activeTool === 'wall') {
    activeCursor = 'cursor-crosshair';
  } else if (activeTool === 'ruler') {
    activeCursor = 'cursor-crosshair';
  } else if (hoverCursor !== 'default') {
    activeCursor = `cursor-${hoverCursor}`;
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${activeCursor}`}
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
