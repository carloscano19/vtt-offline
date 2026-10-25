import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixiRenderer } from './PixiRenderer';
import { useGameStore } from '../stores/useGameStore';
import { useUIStore } from '../stores/useUIStore';
import { screenToWorld, snapPointToGrid, localToWorld, worldToLocal } from './utils/coordinates';
import { Entity, Point2D } from '../types/entity';
import { CameraState } from '../types/game';
import { syncChannel } from '../modules/sync/syncChannel';

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
  const toggleDoor = useGameStore((s) => s.toggleDoor);
  const setDoorLocked = useGameStore((s) => s.setDoorLocked);

  const activeTool = useUIStore((s) => s.activeTool);
  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const ruler = useUIStore((s) => s.ruler);
  const startRulerMeasure = useUIStore((s) => s.startRulerMeasure);
  const updateRulerMeasure = useUIStore((s) => s.updateRulerMeasure);
  const endRulerMeasure = useUIStore((s) => s.endRulerMeasure);
  const showDebugVttOverlay = useUIStore((s) => s.showDebugVttOverlay);
  const isPlayerPreviewMode = useUIStore((s) => s.isPlayerPreviewMode);
  const showPlayerFrame = useUIStore((s) => s.showPlayerFrame);

  // Estado para la herramienta de Paredes invisibles, Puertas y Niebla
  const [draftWallPoints, setDraftWallPoints] = useState<Point2D[]>([]);
  const [draftDoorPoint, setDraftDoorPoint] = useState<Point2D | null>(null);
  const [fogDragRect, setFogDragRect] = useState<{ start: Point2D; current: Point2D } | null>(null);
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
    isDraggingPlayerFrame: boolean;
    isTransformingPlayerFrame: 'scale' | null;
    startPlayerCamera: CameraState;
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
    isDraggingPlayerFrame: false,
    isTransformingPlayerFrame: null,
    startPlayerCamera: { x: 0, y: 0, zoom: 1 },
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
      renderer.sync(
        game,
        ruler,
        selectedEntityIds,
        showDebugVttOverlay,
        draftWallPoints,
        isPlayerPreviewMode,
        showPlayerFrame
      );
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
      rendererRef.current.sync(
        game,
        ruler,
        selectedEntityIds,
        showDebugVttOverlay,
        draftWallPoints,
        isPlayerPreviewMode,
        showPlayerFrame
      );
    }
  }, [game, ruler, selectedEntityIds, showDebugVttOverlay, draftWallPoints, isPlayerPreviewMode, showPlayerFrame]);

  // Reiniciar exploración de niebla en Pixi cuando se vacíe en el store
  useEffect(() => {
    if (rendererRef.current?.fogLayer && Object.keys(game.fog.fogExplorationData || {}).length === 0) {
      rendererRef.current.fogLayer.resetExploration();
    }
  }, [game.fog.fogExplorationData]);

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
        } else if (activeTool === 'door') {
          e.preventDefault();
          setDraftDoorPoint(null);
        } else if (activeTool === 'fogReveal' || activeTool === 'fogHide') {
          e.preventDefault();
          setFogDragRect(null);
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
    return isMaster ? (isPlayerPreviewMode ? game.playerCamera : game.masterCamera) : game.playerCamera;
  }, [isMaster, isPlayerPreviewMode, game.masterCamera, game.playerCamera]);

  const setCamera = useCallback(
    (cam: Partial<{ x: number; y: number; zoom: number }>) => {
      if (isMaster) {
        if (isPlayerPreviewMode) {
          setPlayerCamera(cam);
          syncChannel.sendCamera({ ...game.playerCamera, ...cam });
        } else {
          setMasterCamera(cam);
        }
      } else {
        setPlayerCamera(cam);
      }
    },
    [isMaster, isPlayerPreviewMode, game.playerCamera, setMasterCamera, setPlayerCamera]
  );

  const getCanvasDimensions = useCallback(() => {
    return {
      width: containerRef.current?.clientWidth || window.innerWidth,
      height: containerRef.current?.clientHeight || window.innerHeight
    };
  }, []);

  // 4. Manejo de zoom con rueda del ratón registrado de forma nativa no pasiva (evita warning de Chrome)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheelNative = (e: WheelEvent) => {
      if (!isMaster) return;
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

    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheelNative);
    };
  }, [isMaster, getCamera, getCanvasDimensions, getLocalPointer, setCamera]);

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

    // Herramienta Puerta (crear segmento entre dos clics)
    if (activeTool === 'door') {
      let pt = worldPos;
      if (game.grid.snapToGrid && game.grid.size > 0 && !e.altKey) {
        pt = snapPointToGrid(worldPos, game.grid.size);
      }

      if (!draftDoorPoint) {
        setDraftDoorPoint(pt);
      } else {
        const p1 = draftDoorPoint;
        const p2 = pt;
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 5) {
          const maps = game.entities.filter((ent) => ent.type === 'map');
          const containingMap = maps.find((m) => {
            const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
            const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY;
            return p1.x >= m.x && p1.x <= m.x + mW && p1.y >= m.y && p1.y <= m.y + mH;
          });

          let localP1 = p1;
          let localP2 = p2;
          let mapId: string | undefined = undefined;

          if (containingMap) {
            mapId = containingMap.id;
            const mapPos = { x: containingMap.x, y: containingMap.y };
            localP1 = worldToLocal(p1, mapPos, containingMap.rotation, containingMap.scaleX, containingMap.scaleY);
            localP2 = worldToLocal(p2, mapPos, containingMap.rotation, containingMap.scaleX, containingMap.scaleY);
          }

          const doorEntity: Entity = {
            id: `door_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'door',
            name: `Puerta ${game.entities.filter((ent) => ent.type === 'door').length + 1}`,
            x: containingMap ? containingMap.x : 0,
            y: containingMap ? containingMap.y : 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: 40,
            visibleToPlayers: true,
            locked: false,
            mapId,
            door: {
              isOpen: false,
              isLocked: false,
              p1: localP1,
              p2: localP2,
              openAngle: Math.PI / 2
            }
          };

          addEntity(doorEntity);
          selectEntity(doorEntity.id);
        }
        setDraftDoorPoint(null);
      }
      return;
    }

    // Herramienta Revelar u Ocultar niebla manualmente
    if (activeTool === 'fogReveal' || activeTool === 'fogHide') {
      interactionState.current.startMouse = worldPos;
      setFogDragRect({ start: worldPos, current: worldPos });
      return;
    }

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

      // 1. Interacción con el marco verde de pantalla de jugadores (TV)
      if (showPlayerFrame && !isPlayerPreviewMode) {
        const pCam = game.playerCamera;
        const vp = game.playerViewport || { width: 1920, height: 1080 };
        const pZoom = Math.max(0.05, pCam.zoom || 1);
        const frameW = vp.width / pZoom;
        const frameH = vp.height / pZoom;
        const frameX = pCam.x - frameW / 2;
        const frameY = pCam.y - frameH / 2;

        const frameCorners = [
          { x: frameX, y: frameY },
          { x: frameX + frameW, y: frameY },
          { x: frameX + frameW, y: frameY + frameH },
          { x: frameX, y: frameY + frameH }
        ];

        let hitFrameCorner = false;
        for (const c of frameCorners) {
          if (Math.hypot(worldPos.x - c.x, worldPos.y - c.y) <= handleHitRadius + 4) {
            interactionState.current.isTransformingPlayerFrame = 'scale';
            interactionState.current.startMouse = worldPos;
            interactionState.current.startPlayerCamera = { ...pCam };
            hitFrameCorner = true;
            break;
          }
        }
        if (hitFrameCorner) return;

        // Comprobar etiqueta "TV" o bordes del marco
        const hitBadge =
          worldPos.x >= frameX + 8 &&
          worldPos.x <= frameX + 42 &&
          worldPos.y >= frameY + 4 &&
          worldPos.y <= frameY + 26;

        const nearLeft = Math.abs(worldPos.x - frameX) <= 12 / camera.zoom && worldPos.y >= frameY && worldPos.y <= frameY + frameH;
        const nearRight = Math.abs(worldPos.x - (frameX + frameW)) <= 12 / camera.zoom && worldPos.y >= frameY && worldPos.y <= frameY + frameH;
        const nearTop = Math.abs(worldPos.y - frameY) <= 12 / camera.zoom && worldPos.x >= frameX && worldPos.x <= frameX + frameW;
        const nearBottom = Math.abs(worldPos.y - (frameY + frameH)) <= 12 / camera.zoom && worldPos.x >= frameX && worldPos.x <= frameX + frameW;

        if (hitBadge || nearLeft || nearRight || nearTop || nearBottom) {
          interactionState.current.isDraggingPlayerFrame = true;
          interactionState.current.startMouse = worldPos;
          interactionState.current.startPlayerCamera = { ...pCam };
          return;
        }
      }

      // 2. Interacción con Puertas: clic sobre bisagra / centro de puerta para abrir/cerrar o bloquear
      const doorEntities = game.entities.filter((ent) => ent.type === 'door' && ent.door);
      for (const ent of doorEntities) {
        const door = ent.door!;
        const parentMap = ent.mapId ? game.entities.find((m) => m.id === ent.mapId) : undefined;
        const transformPoint = (p: Point2D): Point2D => {
          if (parentMap) {
            return localToWorld(p, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
          }
          return p;
        };

        const p1 = transformPoint(door.p1);
        const p2 = transformPoint(door.p2);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        const hitCenter = Math.hypot(worldPos.x - mid.x, worldPos.y - mid.y) <= Math.max(16 / camera.zoom, 18);
        const hitHinge = Math.hypot(worldPos.x - p1.x, worldPos.y - p1.y) <= Math.max(14 / camera.zoom, 16);

        let hitLeaf = false;
        const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
        if (l2 > 0) {
          let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
          t = Math.max(0, Math.min(1, t));
          const projX = p1.x + t * (p2.x - p1.x);
          const projY = p1.y + t * (p2.y - p1.y);
          hitLeaf = Math.hypot(worldPos.x - projX, worldPos.y - projY) <= 12 / camera.zoom;
        }

        if (hitCenter || hitHinge || hitLeaf) {
          selectEntity(ent.id, e.shiftKey);
          if (e.altKey) {
            setDoorLocked(ent.id, !door.isLocked);
          } else {
            toggleDoor(ent.id);
          }
          return;
        }
      }

      // 3. Si hay una entidad seleccionada y no bloqueada, comprobar manijas del Gizmo
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (selectedEntity && selectedEntity.type !== 'wall' && selectedEntity.type !== 'door') {
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

      // 4. Si hay una pared seleccionada, comprobar si se pincha en alguno de sus nodos para arrastrarlo
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

      // 5. Buscar entidad bajo el cursor (prioridad: tokens > objetos > puertas > paredes > mapas)
      const typePriority: Record<string, number> = { token: 300, object: 200, door: 180, wall: 150, map: 100 };
      const sortedEntities = [...game.entities].sort((a, b) => {
        const pDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
        if (pDiff !== 0) return pDiff;
        return (b.zIndex ?? 0) - (a.zIndex ?? 0);
      });

      const hitEntity = sortedEntities.find((ent) => {
        if (ent.locked) return false;

        if (ent.type === 'wall' && ent.points && ent.points.length >= 2) {
          const pts = ent.points;
          const count = ent.closed ? pts.length : pts.length - 1;
          for (let i = 0; i < count; i++) {
            const p1 = getWallNodeWorldPos(ent, pts[i]);
            const p2 = getWallNodeWorldPos(ent, pts[(i + 1) % pts.length]);
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
        if (hitEntity.type !== 'wall' && hitEntity.type !== 'door') {
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

    // 1. Paneo de cámara del máster
    if (interactionState.current.isPanning) {
      const dx = (localMouse.x - interactionState.current.startMouse.x) / camera.zoom;
      const dy = (localMouse.y - interactionState.current.startMouse.y) / camera.zoom;
      setCamera({
        x: interactionState.current.startCamera.x - dx,
        y: interactionState.current.startCamera.y - dy
      });
      return;
    }

    // 2. Arrastre de posición del Marco TV de jugadores
    if (interactionState.current.isDraggingPlayerFrame) {
      const dx = worldPos.x - interactionState.current.startMouse.x;
      const dy = worldPos.y - interactionState.current.startMouse.y;
      const newX = interactionState.current.startPlayerCamera.x + dx;
      const newY = interactionState.current.startPlayerCamera.y + dy;
      setPlayerCamera({ x: newX, y: newY });
      syncChannel.sendCamera({ x: newX, y: newY, zoom: game.playerCamera.zoom });
      return;
    }

    // 3. Escalado proporcional (Zoom) del Marco TV de jugadores
    if (interactionState.current.isTransformingPlayerFrame === 'scale') {
      const cam = interactionState.current.startPlayerCamera;
      const startDist = Math.hypot(interactionState.current.startMouse.x - cam.x, interactionState.current.startMouse.y - cam.y);
      const currentDist = Math.hypot(worldPos.x - cam.x, worldPos.y - cam.y);

      if (startDist > 5 && currentDist > 5) {
        const zoomRatio = startDist / currentDist;
        const newZoom = Math.min(Math.max(cam.zoom * zoomRatio, 0.05), 8.0);
        setPlayerCamera({ zoom: newZoom });
        syncChannel.sendCamera({ x: cam.x, y: cam.y, zoom: newZoom });
      }
      return;
    }

    // 4. Medición de regla
    if (activeTool === 'ruler' && ruler.measuring) {
      updateRulerMeasure(worldPos);
      return;
    }

    // 5. Rectángulo de revelado/ocultación de niebla
    if ((activeTool === 'fogReveal' || activeTool === 'fogHide') && fogDragRect) {
      setFogDragRect((prev) => (prev ? { ...prev, current: worldPos } : null));
      return;
    }

    // 6. Rotación con Gizmo
    if (interactionState.current.isTransforming === 'rotate' && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        const angle = Math.atan2(worldPos.y - entity.y, worldPos.x - entity.x) + Math.PI / 2;
        updateEntity(entity.id, { rotation: angle }, false);
      }
      return;
    }

    // 7. Escalado con Gizmo
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

    // 8. Arrastre de nodo de pared
    if (interactionState.current.isDraggingWallNode && interactionState.current.dragWallEntityId) {
      const wall = game.entities.find((ent) => ent.id === interactionState.current.dragWallEntityId);
      if (wall && wall.points) {
        let newPt = worldPos;
        if (game.grid.snapToGrid && game.grid.size > 0 && !e.altKey) {
          newPt = snapPointToGrid(worldPos, game.grid.size);
        }
        if (wall.mapId) {
          const parentMap = game.entities.find((m) => m.id === wall.mapId);
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

    // 9. Arrastre y movimiento de entidad
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

    // 10. Cálculo de cursor dinámico cuando no se está arrastrando nada
    if (activeTool === 'select') {
      let newCursor = 'default';

      // Comprobar marco TV de jugadores
      if (showPlayerFrame && !isPlayerPreviewMode) {
        const pCam = game.playerCamera;
        const vp = game.playerViewport || { width: 1920, height: 1080 };
        const pZoom = Math.max(0.05, pCam.zoom || 1);
        const frameW = vp.width / pZoom;
        const frameH = vp.height / pZoom;
        const frameX = pCam.x - frameW / 2;
        const frameY = pCam.y - frameH / 2;

        const handleRad = Math.max(12 / camera.zoom, 14);
        const frameCorners = [
          { x: frameX, y: frameY, cursor: 'nwse-resize' },
          { x: frameX + frameW, y: frameY, cursor: 'nesw-resize' },
          { x: frameX + frameW, y: frameY + frameH, cursor: 'nwse-resize' },
          { x: frameX, y: frameY + frameH, cursor: 'nesw-resize' }
        ];

        let hitCorner = false;
        for (const c of frameCorners) {
          if (Math.hypot(worldPos.x - c.x, worldPos.y - c.y) <= handleRad) {
            newCursor = c.cursor;
            hitCorner = true;
            break;
          }
        }

        if (!hitCorner) {
          const hitBadge =
            worldPos.x >= frameX + 8 &&
            worldPos.x <= frameX + 42 &&
            worldPos.y >= frameY + 4 &&
            worldPos.y <= frameY + 26;

          const nearLeft = Math.abs(worldPos.x - frameX) <= 10 / camera.zoom && worldPos.y >= frameY && worldPos.y <= frameY + frameH;
          const nearRight = Math.abs(worldPos.x - (frameX + frameW)) <= 10 / camera.zoom && worldPos.y >= frameY && worldPos.y <= frameY + frameH;
          const nearTop = Math.abs(worldPos.y - frameY) <= 10 / camera.zoom && worldPos.x >= frameX && worldPos.x <= frameX + frameW;
          const nearBottom = Math.abs(worldPos.y - (frameY + frameH)) <= 10 / camera.zoom && worldPos.x >= frameX && worldPos.x <= frameX + frameW;

          if (hitBadge || nearLeft || nearRight || nearTop || nearBottom) {
            newCursor = 'move';
          }
        }
      }

      // Comprobar puertas
      if (newCursor === 'default') {
        const doorEntities = game.entities.filter((ent) => ent.type === 'door' && ent.door);
        for (const ent of doorEntities) {
          const door = ent.door!;
          const parentMap = ent.mapId ? game.entities.find((m) => m.id === ent.mapId) : undefined;
          const p1 = parentMap ? localToWorld(door.p1, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY) : door.p1;
          const p2 = parentMap ? localToWorld(door.p2, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY) : door.p2;
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          if (Math.hypot(worldPos.x - mid.x, worldPos.y - mid.y) <= Math.max(16 / camera.zoom, 18)) {
            newCursor = 'pointer';
            break;
          }
        }
      }

      // Comprobar Gizmo de entidad seleccionada
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (newCursor === 'default' && selectedEntity && selectedEntity.type !== 'wall' && selectedEntity.type !== 'door') {
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

        const rotDistLocal = 25 / Math.abs(selectedEntity.scaleY || 1);
        const rotWorld = localToWorldPos(offX + bW / 2, offY - rotDistLocal);
        if (Math.hypot(worldPos.x - rotWorld.x, worldPos.y - rotWorld.y) <= handleHitRadius) {
          newCursor = 'grab';
        } else {
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

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isMaster) return;

    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const localMouse = getLocalPointer(e);
    const worldPos = screenToWorld(localMouse, camera, width, height);

    // Finalizar arrastre de marco TV
    if (interactionState.current.isDraggingPlayerFrame || interactionState.current.isTransformingPlayerFrame) {
      syncChannel.sendCamera(game.playerCamera);
      interactionState.current.isDraggingPlayerFrame = false;
      interactionState.current.isTransformingPlayerFrame = null;
    }

    // Finalizar área de revelado u ocultación de niebla
    if ((activeTool === 'fogReveal' || activeTool === 'fogHide') && fogDragRect) {
      const x1 = Math.min(fogDragRect.start.x, worldPos.x);
      const y1 = Math.min(fogDragRect.start.y, worldPos.y);
      const w = Math.abs(worldPos.x - fogDragRect.start.x);
      const h = Math.abs(worldPos.y - fogDragRect.start.y);

      if (w > 5 && h > 5 && rendererRef.current?.fogLayer) {
        rendererRef.current.fogLayer.addManualArea(
          { x: x1, y: y1, width: w, height: h },
          activeTool === 'fogReveal'
        );
      }
      setFogDragRect(null);
    }

    // Si estábamos arrastrando una entidad y snapToGrid está activo, ajustar posición al soltar
    if (interactionState.current.isDraggingEntity && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        let finalX = entity.x;
        let finalY = entity.y;

        if (game.grid.snapToGrid && game.grid.size > 0) {
          if (entity.type === 'map') {
            const snapped = snapPointToGrid({ x: entity.x, y: entity.y }, game.grid.size);
            finalX = snapped.x;
            finalY = snapped.y;
          } else {
            const halfGrid = game.grid.size / 2;
            const snapped = snapPointToGrid({ x: entity.x - halfGrid, y: entity.y - halfGrid }, game.grid.size);
            finalX = snapped.x + halfGrid;
            finalY = snapped.y + halfGrid;
          }
        }

        updateEntity(entity.id, { x: finalX, y: finalY }, true);
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
        vision: entityType === 'token' ? { active: true, rangeInSquares: 12, hardness: 0.5 } : undefined,
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
  } else if (
    activeTool === 'wall' ||
    activeTool === 'door' ||
    activeTool === 'ruler' ||
    activeTool === 'fogReveal' ||
    activeTool === 'fogHide'
  ) {
    activeCursor = 'cursor-crosshair';
  } else if (hoverCursor !== 'default') {
    activeCursor = `cursor-${hoverCursor}`;
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${activeCursor}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Vista previa visual de borrador de puerta */}
      {draftDoorPoint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-950/90 text-amber-300 border border-amber-600/80 px-3 py-1 rounded text-xs shadow-lg pointer-events-none z-20">
          Haz clic en el punto final de la puerta (Esc para cancelar)
        </div>
      )}
    </div>
  );
};
