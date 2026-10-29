import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixiRenderer } from './PixiRenderer';
import { useGameStore } from '../stores/useGameStore';
import { useUIStore } from '../stores/useUIStore';
import { screenToWorld, snapPointToGrid, snapPointToGridOrMidpoint, localToWorld, worldToLocal } from './utils/coordinates';
import { Entity, Point2D, recalculateDoorEndpoints, rotateDoorAroundHinge, getDefaultSnapToGrid } from '../types/entity';
import { CameraState } from '../types/game';
import { syncChannel } from '../modules/sync/syncChannel';
import { getZoomSensitivity } from '../modules/settings/zoomSensitivity';
import { isMovementBlockedByWall } from '../modules/walls/wallManager';
import { getAsset, db } from '../db/dexie';
import { cloudSync } from '../modules/sync/cloudSync';
import { cloudGameSync } from '../modules/persistence/cloudGameSync';
import { unionExplored } from '../modules/vision/fogMemory';
import { visionManager } from '../modules/vision/visionManager';
import { getMediaDimensions, persistAssetDimensions } from '../utils/mediaDimensions';
import { FastActionBar } from '../ui/master/components/FastActionBar';

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
  const setActiveTool = useUIStore((s) => s.setActiveTool);
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

  // Estado para la herramienta de Paredes invisibles y Niebla
  const [draftWallPoints, setDraftWallPoints] = useState<Point2D[]>([]);
  const [fogDragRect, setFogDragRect] = useState<{ start: Point2D; current: Point2D } | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string>('default');

  const [canvasDimensions, setCanvasDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setCanvasDimensions({
          width: containerRef.current.clientWidth || window.innerWidth,
          height: containerRef.current.clientHeight || window.innerHeight
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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
    isDraggingDoorHandle: 'p1' | 'p2' | 'body' | null;
    dragDoorEntityId: string | null;
    startDoorP1: Point2D;
    startDoorP2: Point2D;
    doorClickToggled: boolean;
    startMouse: Point2D;
    startEntityPos: Point2D;
    startEntityRotation: number;
    startEntityScale: { x: number; y: number };
    startCamera: Point2D;
    lastPosSyncTime: number;
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
    isDraggingDoorHandle: null,
    dragDoorEntityId: null,
    startDoorP1: { x: 0, y: 0 },
    startDoorP2: { x: 0, y: 0 },
    doorClickToggled: false,
    startMouse: { x: 0, y: 0 },
    startEntityPos: { x: 0, y: 0 },
    startEntityRotation: 0,
    startEntityScale: { x: 1, y: 1 },
    startCamera: { x: 0, y: 0 },
    lastPosSyncTime: 0
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
        useGameStore.getState().game,
        useUIStore.getState().ruler,
        useUIStore.getState().selectedEntityIds,
        useUIStore.getState().showDebugVttOverlay,
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
        showPlayerFrame,
        activeTool,
        fogDragRect
      );
    }
  }, [game, ruler, selectedEntityIds, showDebugVttOverlay, draftWallPoints, isPlayerPreviewMode, showPlayerFrame, activeTool, fogDragRect]);

  const revealFogRect = useGameStore((s) => s.revealFogRect);
  const hideFogRect = useGameStore((s) => s.hideFogRect);

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

  // 3. Atajos de teclado para la barra espaciadora, Enter, Esc y movimiento con flechas
  useEffect(() => {
    if (!isMaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const activeTag = (activeEl?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || activeEl?.isContentEditable) return;

      // Movimiento de token con flechas de teclado (1 casilla centrada con detección de colisión de paredes)
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        if (selectedEntityIds.length === 0) return;
        const selectedToken = game.entities.find(
          (ent) => selectedEntityIds.includes(ent.id) && ent.type === 'token'
        );
        if (!selectedToken || selectedToken.locked) return;

        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        else if (e.key === 'ArrowDown') dy = 1;
        else if (e.key === 'ArrowLeft') dx = -1;
        else if (e.key === 'ArrowRight') dx = 1;

        const gridSize = game.grid.size > 0 ? game.grid.size : 70;
        const entitySnap = getDefaultSnapToGrid(selectedToken);
        const shouldSnap = game.grid.snapToGrid && entitySnap && !e.altKey;

        let targetX = selectedToken.x;
        let targetY = selectedToken.y;

        if (shouldSnap) {
          const currCellX = Math.floor(selectedToken.x / gridSize) * gridSize + gridSize / 2;
          const currCellY = Math.floor(selectedToken.y / gridSize) * gridSize + gridSize / 2;
          targetX = currCellX + dx * gridSize;
          targetY = currCellY + dy * gridSize;
        } else {
          // Entidad libre o snap desactivado: pasos de 1/4 de casilla
          const quarterGrid = gridSize / 4;
          targetX = selectedToken.x + dx * quarterGrid;
          targetY = selectedToken.y + dy * quarterGrid;
        }

        const fromPt: Point2D = { x: selectedToken.x, y: selectedToken.y };
        const toPt: Point2D = { x: targetX, y: targetY };

        const wallsBlock = Boolean(game.grid.wallsBlockMovement);
        if (!wallsBlock || !isMovementBlockedByWall(fromPt, toPt, game.entities)) {
          e.preventDefault();
          updateEntity(selectedToken.id, { x: targetX, y: targetY }, true);
        } else {
          e.preventDefault(); // Bloqueado por pared o puerta cerrada (solo si la opción está activada)
        }
        return;
      }

      // Rotación rápida con teclado R / Shift+R (90 grados para puertas, tokens y objetos seleccionados)
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selectedEntityIds.length > 0) {
          const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
          if (selectedEntity) {
            e.preventDefault();
            const delta = e.shiftKey ? -Math.PI / 2 : Math.PI / 2;
            let newRot = selectedEntity.rotation + delta;
            newRot = (newRot % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

            if (selectedEntity.type === 'door' && selectedEntity.door) {
              const length = selectedEntity.door.length ?? 70;
              const isInv = selectedEntity.door.isHingeInverted ?? false;
              const rotated = rotateDoorAroundHinge(selectedEntity.door.p1, newRot, length, isInv);
              updateEntity(
                selectedEntity.id,
                {
                  x: rotated.x,
                  y: rotated.y,
                  rotation: newRot,
                  scaleX: 1,
                  scaleY: 1,
                  door: {
                    ...selectedEntity.door,
                    p1: rotated.p1,
                    p2: rotated.p2
                  }
                },
                true
              );
            } else {
              updateEntity(selectedEntity.id, { rotation: newRot }, true);
            }
          }
        }
        return;
      }

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
  }, [isMaster, activeTool, finishDraftWall, selectedEntityIds, game.entities, game.grid.size, updateEntity]);

  // Funciones auxiliares de cámara y coordenadas
  const getCamera = useCallback(() => {
    return isMaster
      ? (isPlayerPreviewMode ? game.playerCamera : game.masterCamera)
      : (game.followMasterCamera ? game.masterCamera : game.playerCamera);
  }, [isMaster, isPlayerPreviewMode, game.masterCamera, game.playerCamera, game.followMasterCamera]);

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
        const currentEffective = game.followMasterCamera ? game.masterCamera : game.playerCamera;
        if (game.followMasterCamera) {
          useGameStore.getState().setFollowMasterCamera(false);
        }
        const updated = { ...currentEffective, ...cam };
        setPlayerCamera(updated);
        syncChannel.sendPlayerCameraChanged(updated);
      }
    },
    [isMaster, isPlayerPreviewMode, game.playerCamera, game.masterCamera, game.followMasterCamera, setMasterCamera, setPlayerCamera]
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
      e.preventDefault();

      const { width, height } = getCanvasDimensions();
      const camera = getCamera();

      // Normalizar deltas a píxeles (deltaMode 1 = líneas, 2 = páginas)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const dX = e.deltaX * unit;
      const dY = e.deltaY * unit;

      // Desplazamiento con dos dedos en trackpad (sin ctrlKey): mover la cámara
      const isTrackpadScroll =
        !e.ctrlKey &&
        e.deltaMode === 0 &&
        (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);
      if (isTrackpadScroll) {
        setCamera({ x: camera.x + dX / camera.zoom, y: camera.y + dY / camera.zoom });
        return;
      }

      const mousePos = getLocalPointer(e);
      const worldBefore = screenToWorld(mousePos, camera, width, height);

      // Pellizco (ctrlKey) k=0.01; rueda del ratón k=0.0015; multiplicado por la sensibilidad del usuario
      const k = (e.ctrlKey ? 0.01 : 0.0015) * getZoomSensitivity();
      const clampedDelta = Math.max(-200, Math.min(200, dY));
      const newZoom = Math.min(Math.max(camera.zoom * Math.exp(-clampedDelta * k), 0.05), 8.0);

      // Ajustar posición de la cámara para que el punto bajo el ratón quede fijo
      const newCamX = worldBefore.x - (mousePos.x - width / 2) / newZoom;
      const newCamY = worldBefore.y - (mousePos.y - height / 2) / newZoom;

      setCamera({ x: newCamX, y: newCamY, zoom: newZoom });
    };

    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheelNative);
    };
  }, [getCamera, getCanvasDimensions, getLocalPointer, setCamera]);

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
    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const localMouse = getLocalPointer(e);

    // En la ventana de jugadores, arrastrar con ratón o trackpad desplaza la cámara
    if (!isMaster) {
      interactionState.current.isPanning = true;
      interactionState.current.startMouse = localMouse;
      interactionState.current.startCamera = { x: camera.x, y: camera.y };
      return;
    }

    const worldPos = screenToWorld(localMouse, camera, width, height);

    // Paneo con botón central (botón 1) o barra espaciadora pulsada o herramienta Paneo
    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      interactionState.current.isPanning = true;
      interactionState.current.startMouse = localMouse;
      interactionState.current.startCamera = { x: camera.x, y: camera.y };
      return;
    }

    if (e.button !== 0) return; // Solo clic izquierdo para el resto de acciones

    // Herramienta Puerta: un solo clic coloca una puerta de 1 casilla de largo, horizontal, centrada en la línea de cuadrícula más cercana
    if (activeTool === 'door') {
      const maps = game.entities.filter((ent) => ent.type === 'map');
      const containingMap = maps.find((m) => {
        const mW = (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX;
        const mH = (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY;
        return worldPos.x >= m.x && worldPos.x <= m.x + mW && worldPos.y >= m.y && worldPos.y <= m.y + mH;
      }) || (maps.length === 1 ? maps[0] : undefined);

      const gridSize = containingMap?.mapData?.pixelsPerGrid ?? (game.grid.size > 0 ? game.grid.size : 70);
      const origin = containingMap ? { x: containingMap.x, y: containingMap.y } : { x: 0, y: 0 };

      let localX: number;
      let localY: number;
      let localRot: number;

      if (containingMap) {
        const localPos = worldToLocal(worldPos, origin, containingMap.rotation, containingMap.scaleX, containingMap.scaleY);
        if (game.grid.snapToGrid && !e.altKey) {
          localY = Math.round(localPos.y / gridSize) * gridSize;
          localX = Math.floor(localPos.x / gridSize) * gridSize + gridSize / 2;
        } else {
          localX = localPos.x;
          localY = localPos.y;
        }
        localRot = 0;
      } else {
        if (game.grid.snapToGrid && !e.altKey) {
          localY = Math.round(worldPos.y / gridSize) * gridSize;
          localX = Math.floor(worldPos.x / gridSize) * gridSize + gridSize / 2;
        } else {
          localX = worldPos.x;
          localY = worldPos.y;
        }
        localRot = 0;
      }

      const doorLength = gridSize;
      const { p1, p2 } = recalculateDoorEndpoints(localX, localY, localRot, doorLength, false);

      const doorEntity: Entity = {
        id: `door_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'door',
        name: `Puerta ${game.entities.filter((ent) => ent.type === 'door').length + 1}`,
        x: localX,
        y: localY,
        rotation: localRot,
        scaleX: 1,
        scaleY: 1,
        zIndex: 40,
        visibleToPlayers: true,
        locked: false,
        mapId: containingMap ? containingMap.id : undefined,
        door: {
          isOpen: false,
          isLocked: false,
          length: doorLength,
          isHingeInverted: false,
          p1,
          p2,
          openAngle: Math.PI / 2
        }
      };

      addEntity(doorEntity);
      selectEntity(doorEntity.id);
      setActiveTool('select');
      return;
    }

    // Herramienta Luz: clic para colocar una nueva luz dinámica
    if (activeTool === 'light') {
      let pt = worldPos;
      if (game.grid.snapToGrid && game.grid.size > 0 && !e.altKey) {
        pt = snapPointToGrid(worldPos, game.grid.size);
      }

      const lightEntity: Entity = {
        id: `light_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'light',
        name: `Luz ${game.entities.filter((ent) => ent.type === 'light').length + 1}`,
        x: pt.x,
        y: pt.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 45,
        visibleToPlayers: true,
        locked: false,
        light: {
          color: '#ffaa44',
          intensity: 100,
          brightRadiusInSquares: 4,
          dimRadiusInSquares: 2,
          edgeHardness: 0.5,
          flicker: false
        }
      };

      addEntity(lightEntity);
      selectEntity(lightEntity.id);
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
      const handleHitRadius = 12 / camera.zoom;

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

      // 1b. Comprobar botón del ojo (mostrar/ocultar a jugadores) en la entidad seleccionada
      if (selectedEntityIds.length === 1 && rendererRef.current?.gizmoLayer) {
        const entForEye = game.entities.find((e) => e.id === selectedEntityIds[0]);
        if (entForEye && entForEye.type !== 'wall') {
          const eyeWorldPos = rendererRef.current.gizmoLayer.getEyeButtonWorldPos(entForEye);
          const hitRadius = Math.max(14 / camera.zoom, 14);
          if (Math.hypot(worldPos.x - eyeWorldPos.x, worldPos.y - eyeWorldPos.y) <= hitRadius) {
            e.preventDefault();
            const currentVis = entForEye.visibleToPlayers !== false;
            updateEntity(entForEye.id, { visibleToPlayers: !currentVis }, true);
            return;
          }
        }
      }

      // 2. Si hay una entidad seleccionada y no bloqueada, comprobar manijas del Gizmo (incluyendo Puertas)
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (selectedEntity && selectedEntity.type !== 'wall') {
        const localBounds = rendererRef.current?.gizmoLayer
          ? rendererRef.current.gizmoLayer.getEntityLocalBounds(selectedEntity)
          : { offsetX: -35, offsetY: -35, width: 70, height: 70 };
        const bW = localBounds.width;
        const bH = localBounds.height;
        const offX = localBounds.offsetX;
        const offY = localBounds.offsetY;

        const parentMap = selectedEntity.mapId ? game.entities.find((m) => m.id === selectedEntity.mapId) : undefined;
        const worldCenter = parentMap
          ? localToWorld(
              { x: selectedEntity.x, y: selectedEntity.y },
              { x: parentMap.x, y: parentMap.y },
              parentMap.rotation,
              parentMap.scaleX,
              parentMap.scaleY
            )
          : { x: selectedEntity.x, y: selectedEntity.y };
        const worldRotation = parentMap ? selectedEntity.rotation + parentMap.rotation : selectedEntity.rotation;

        const cosR = Math.cos(worldRotation);
        const sinR = Math.sin(worldRotation);

        const localToWorldPos = (lx: number, ly: number) => {
          const scaledX = lx * selectedEntity.scaleX;
          const scaledY = ly * selectedEntity.scaleY;
          return {
            x: worldCenter.x + (scaledX * cosR - scaledY * sinR),
            y: worldCenter.y + (scaledX * sinR + scaledY * cosR)
          };
        };

        // Manija de rotación (arriba de la caja)
        const rotDistLocal = 26 / (camera.zoom * Math.abs(selectedEntity.scaleY || 1));
        const rotLocalX = offX + bW / 2;
        const rotLocalY = offY - rotDistLocal;
        const rotWorld = localToWorldPos(rotLocalX, rotLocalY);

        if (Math.hypot(worldPos.x - rotWorld.x, worldPos.y - rotWorld.y) <= handleHitRadius) {
          interactionState.current.isTransforming = 'rotate';
          interactionState.current.dragEntityId = selectedEntity.id;
          interactionState.current.startMouse = localMouse;
          interactionState.current.startEntityRotation = worldRotation;
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

      // 5. Buscar entidad bajo el cursor (prioridad: luces > efectos > tokens > objetos > puertas > paredes > mapas)
      const typePriority: Record<string, number> = { light: 350, effect: 320, token: 300, object: 200, door: 180, wall: 150, map: 100 };
      const sortedEntities = [...game.entities].sort((a, b) => {
        const pDiff = (typePriority[b.type] ?? 0) - (typePriority[a.type] ?? 0);
        if (pDiff !== 0) return pDiff;
        return (b.zIndex ?? 0) - (a.zIndex ?? 0);
      });

      const hitEntity = sortedEntities.find((ent) => {
        if (ent.locked) return false;

        if (ent.type === 'light') {
          return Math.hypot(worldPos.x - ent.x, worldPos.y - ent.y) <= Math.max(20 / camera.zoom, 25);
        }

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

        if (ent.type === 'door' && ent.door) {
          const parentMap = ent.mapId ? game.entities.find((m) => m.id === ent.mapId) : undefined;
          const p1 = parentMap ? localToWorld(ent.door.p1, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY) : ent.door.p1;
          const p2 = parentMap ? localToWorld(ent.door.p2, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY) : ent.door.p2;

          const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
          if (l2 > 0) {
            let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = p1.x + t * (p2.x - p1.x);
            const projY = p1.y + t * (p2.y - p1.y);
            if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(16 / camera.zoom, 18)) {
              return true;
            }
          }
          if (ent.door.isOpen) {
            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const baseAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const currentAngle = baseAngle + (ent.door.openAngle ?? Math.PI / 2);
            const leafEnd = {
              x: p1.x + Math.cos(currentAngle) * length,
              y: p1.y + Math.sin(currentAngle) * length
            };
            const leafL2 = (leafEnd.x - p1.x) ** 2 + (leafEnd.y - p1.y) ** 2;
            if (leafL2 > 0) {
              let t = ((worldPos.x - p1.x) * (leafEnd.x - p1.x) + (worldPos.y - p1.y) * (leafEnd.y - p1.y)) / leafL2;
              t = Math.max(0, Math.min(1, t));
              const projX = p1.x + t * (leafEnd.x - p1.x);
              const projY = p1.y + t * (leafEnd.y - p1.y);
              if (Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(16 / camera.zoom, 18)) {
                return true;
              }
            }
          }
          return false;
        }

        if (ent.type === 'map') {
          const mapW = (ent.mapData?.gridWidth ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleX;
          const mapH = (ent.mapData?.gridHeight ?? 10) * (ent.mapData?.pixelsPerGrid ?? 70) * ent.scaleY;
          return worldPos.x >= ent.x && worldPos.x <= ent.x + mapW && worldPos.y >= ent.y && worldPos.y <= ent.y + mapH;
        }

        let baseRadius = ent.type === 'token' || ent.type === 'effect' ? 35 : 45;
        if (rendererRef.current?.gizmoLayer) {
          const lb = rendererRef.current.gizmoLayer.getEntityLocalBounds(ent);
          if (lb) {
            baseRadius = Math.max(lb.width, lb.height) / 2;
          }
        } else if (rendererRef.current?.tokensLayer) {
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
          syncChannel.setDraggingActive(true);
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
    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const localMouse = getLocalPointer(e);

    // En la ventana de jugadores, gestionar paneo
    if (!isMaster) {
      if (interactionState.current.isPanning) {
        const dx = (localMouse.x - interactionState.current.startMouse.x) / camera.zoom;
        const dy = (localMouse.y - interactionState.current.startMouse.y) / camera.zoom;
        setCamera({
          x: interactionState.current.startCamera.x - dx,
          y: interactionState.current.startCamera.y - dy
        });
      }
      return;
    }

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
        if (entity.type === 'door' && entity.door) {
          const parentMap = entity.mapId ? game.entities.find((m) => m.id === entity.mapId) : undefined;
          const worldP1 = parentMap
            ? localToWorld(entity.door.p1, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY)
            : entity.door.p1;

          let worldAngle = Math.atan2(worldPos.y - worldP1.y, worldPos.x - worldP1.x);
          if (entity.door.isHingeInverted) {
            worldAngle += Math.PI;
          }
          if (game.grid.snapToGrid && !e.altKey) {
            const step = Math.PI / 4; // 45 grados
            worldAngle = Math.round(worldAngle / step) * step;
          }

          const localRotation = parentMap ? worldAngle - parentMap.rotation : worldAngle;
          const length = entity.door.length ?? 70;
          const isInv = entity.door.isHingeInverted ?? false;
          const rotated = rotateDoorAroundHinge(entity.door.p1, localRotation, length, isInv);
          updateEntity(
            entity.id,
            {
              x: rotated.x,
              y: rotated.y,
              rotation: localRotation,
              scaleX: 1,
              scaleY: 1,
              door: {
                ...entity.door,
                p1: rotated.p1,
                p2: rotated.p2
              }
            },
            false
          );
        } else {
          const parentMap = entity.mapId ? game.entities.find((m) => m.id === entity.mapId) : undefined;
          const worldCenter = parentMap
            ? localToWorld({ x: entity.x, y: entity.y }, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY)
            : { x: entity.x, y: entity.y };

          let worldAngle = Math.atan2(worldPos.y - worldCenter.y, worldPos.x - worldCenter.x) + Math.PI / 2;
          const localRotation = parentMap ? worldAngle - parentMap.rotation : worldAngle;
          updateEntity(entity.id, { rotation: localRotation }, false);
        }
      }
      return;
    }

    // 7. Escalado con Gizmo
    if (interactionState.current.isTransforming === 'scale' && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        if (entity.type === 'door' && entity.door) {
          const parentMap = entity.mapId ? game.entities.find((m) => m.id === entity.mapId) : undefined;
          const worldCenter = parentMap
            ? localToWorld({ x: entity.x, y: entity.y }, { x: parentMap.x, y: parentMap.y }, parentMap.rotation, parentMap.scaleX, parentMap.scaleY)
            : { x: entity.x, y: entity.y };
          const worldRot = parentMap ? entity.rotation + parentMap.rotation : entity.rotation;

          // Proyección del vector del ratón sobre el eje longitudinal de la puerta
          const dx = worldPos.x - worldCenter.x;
          const dy = worldPos.y - worldCenter.y;
          const cosR = Math.cos(worldRot);
          const sinR = Math.sin(worldRot);
          const distAlongAxis = Math.abs(dx * cosR + dy * sinR);
          const rawLength = distAlongAxis * 2;

          let newLength = rawLength;
          if (game.grid.snapToGrid && !e.altKey) {
            const gridSize = parentMap?.mapData?.pixelsPerGrid ?? (game.grid.size > 0 ? game.grid.size : 70);
            const halfGrid = gridSize / 2;
            const snappedHalves = Math.max(1, Math.round(rawLength / halfGrid));
            newLength = snappedHalves * halfGrid;
          } else {
            newLength = Math.max(10, rawLength);
          }

          const { p1, p2 } = recalculateDoorEndpoints(entity.x, entity.y, entity.rotation, newLength, entity.door.isHingeInverted);
          updateEntity(entity.id, { scaleX: 1, scaleY: 1, door: { ...entity.door, length: newLength, p1, p2 } }, false);
        } else {
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

    // 9. Arrastre y movimiento de entidad (Tokens, Objetos, Efectos y Puertas)
    if (interactionState.current.isDraggingEntity && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        const dx = worldPos.x - interactionState.current.startMouse.x;
        const dy = worldPos.y - interactionState.current.startMouse.y;

        if (entity.type === 'door' && entity.door) {
          const parentMap = entity.mapId ? game.entities.find((m) => m.id === entity.mapId) : undefined;
          let localDx = dx;
          let localDy = dy;
          if (parentMap) {
            const cosM = Math.cos(parentMap.rotation);
            const sinM = Math.sin(parentMap.rotation);
            localDx = (dx * cosM + dy * sinM) / parentMap.scaleX;
            localDy = (-dx * sinM + dy * cosM) / parentMap.scaleY;
          }
          const newX = interactionState.current.startEntityPos.x + localDx;
          const newY = interactionState.current.startEntityPos.y + localDy;
          const { p1, p2 } = recalculateDoorEndpoints(newX, newY, entity.rotation, entity.door.length ?? 70, entity.door.isHingeInverted);
          updateEntity(entity.id, { x: newX, y: newY, door: { ...entity.door, p1, p2 } }, false);
          const now = performance.now();
          if (now - interactionState.current.lastPosSyncTime >= 33) {
            interactionState.current.lastPosSyncTime = now;
            syncChannel.sendEntityPos(entity.id, newX, newY);
          }
        } else {
          const newX = interactionState.current.startEntityPos.x + dx;
          const newY = interactionState.current.startEntityPos.y + dy;
          updateEntity(entity.id, { x: newX, y: newY }, false);
          const now = performance.now();
          if (now - interactionState.current.lastPosSyncTime >= 33) {
            interactionState.current.lastPosSyncTime = now;
            syncChannel.sendEntityPos(entity.id, newX, newY);
          }
        }
      }
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

      // Comprobar Gizmo de entidad seleccionada (incluyendo puertas)
      const selectedEntity = game.entities.find((ent) => selectedEntityIds.includes(ent.id) && !ent.locked);
      if (newCursor === 'default' && selectedEntityIds.length === 1 && rendererRef.current?.gizmoLayer) {
        const entForEye = game.entities.find((e) => e.id === selectedEntityIds[0]);
        if (entForEye && entForEye.type !== 'wall') {
          const eyeWorldPos = rendererRef.current.gizmoLayer.getEyeButtonWorldPos(entForEye);
          const hitRadius = Math.max(14 / camera.zoom, 14);
          if (Math.hypot(worldPos.x - eyeWorldPos.x, worldPos.y - eyeWorldPos.y) <= hitRadius) {
            newCursor = 'pointer';
          }
        }
      }

      if (newCursor === 'default' && selectedEntity && selectedEntity.type !== 'wall') {
        const handleHitRadius = 12 / camera.zoom;

        const localBounds = rendererRef.current?.gizmoLayer
          ? rendererRef.current.gizmoLayer.getEntityLocalBounds(selectedEntity)
          : { offsetX: -35, offsetY: -35, width: 70, height: 70 };
        const bW = localBounds.width;
        const bH = localBounds.height;
        const offX = localBounds.offsetX;
        const offY = localBounds.offsetY;

        const parentMap = selectedEntity.mapId ? game.entities.find((m) => m.id === selectedEntity.mapId) : undefined;
        const worldCenter = parentMap
          ? localToWorld(
              { x: selectedEntity.x, y: selectedEntity.y },
              { x: parentMap.x, y: parentMap.y },
              parentMap.rotation,
              parentMap.scaleX,
              parentMap.scaleY
            )
          : { x: selectedEntity.x, y: selectedEntity.y };
        const worldRotation = parentMap ? selectedEntity.rotation + parentMap.rotation : selectedEntity.rotation;

        const cosR = Math.cos(worldRotation);
        const sinR = Math.sin(worldRotation);

        const localToWorldPos = (lx: number, ly: number) => {
          const scaledX = lx * selectedEntity.scaleX;
          const scaledY = ly * selectedEntity.scaleY;
          return {
            x: worldCenter.x + (scaledX * cosR - scaledY * sinR),
            y: worldCenter.y + (scaledX * sinR + scaledY * cosR)
          };
        };

        const rotDistLocal = 26 / (camera.zoom * Math.abs(selectedEntity.scaleY || 1));
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
    if (!isMaster) {
      interactionState.current.isPanning = false;
      return;
    }

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

      if (w > 5 && h > 5) {
        const rect = { x: x1, y: y1, width: w, height: h };
        if (activeTool === 'fogReveal') revealFogRect(rect);
        else hideFogRect(rect);
      }
      setFogDragRect(null);
    }

    // Si estábamos arrastrando una entidad y snapToGrid está activo, ajustar posición al soltar
    if (interactionState.current.isDraggingEntity && interactionState.current.dragEntityId) {
      const entity = game.entities.find((ent) => ent.id === interactionState.current.dragEntityId);
      if (entity) {
        let finalX = entity.x;
        let finalY = entity.y;

        if (entity.type === 'door' && entity.door) {
          if (game.grid.snapToGrid && !e.altKey) {
            const parentMap = entity.mapId ? game.entities.find((m) => m.id === entity.mapId) : undefined;
            const gridSize = parentMap?.mapData?.pixelsPerGrid ?? (game.grid.size > 0 ? game.grid.size : 70);
            const halfGrid = gridSize / 2;
            finalX = Math.round(entity.x / halfGrid) * halfGrid;
            finalY = Math.round(entity.y / halfGrid) * halfGrid;
          }
          const { p1, p2 } = recalculateDoorEndpoints(finalX, finalY, entity.rotation, entity.door.length ?? 70, entity.door.isHingeInverted);
          updateEntity(entity.id, { x: finalX, y: finalY, scaleX: 1, scaleY: 1, door: { ...entity.door, p1, p2 } }, true);
        } else {

        const entitySnap = getDefaultSnapToGrid(entity);
        const shouldSnap = game.grid.snapToGrid && entitySnap && !e.altKey;

        if (shouldSnap && game.grid.size > 0) {
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

        if (game.grid.wallsBlockMovement && interactionState.current.startEntityPos && entity.type === 'token') {
          if (isMovementBlockedByWall(interactionState.current.startEntityPos, { x: finalX, y: finalY }, game.entities)) {
            finalX = interactionState.current.startEntityPos.x;
            finalY = interactionState.current.startEntityPos.y;
          }
        }

        updateEntity(entity.id, { x: finalX, y: finalY }, true);
        }
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
        if (entity.type === 'door' && entity.door) {
          const { p1, p2 } = recalculateDoorEndpoints(entity.x, entity.y, entity.rotation, entity.door.length ?? 70, entity.door.isHingeInverted);
          updateEntity(entity.id, { rotation: entity.rotation, scaleX: 1, scaleY: 1, door: { ...entity.door, p1, p2 } }, true);
        } else if (interactionState.current.isTransforming === 'rotate') {
          updateEntity(entity.id, { rotation: entity.rotation }, true);
        } else if (interactionState.current.isTransforming === 'scale') {
          updateEntity(entity.id, { scaleX: entity.scaleX, scaleY: entity.scaleY }, true);
        }
      }
    }

    if (activeTool === 'ruler') {
      endRulerMeasure();
    }

    const wasDraggingEntity = interactionState.current.isDraggingEntity;

    interactionState.current.isPanning = false;
    interactionState.current.isDraggingEntity = false;
    interactionState.current.isTransforming = null;
    interactionState.current.isDraggingWallNode = false;
    interactionState.current.dragWallEntityId = null;
    interactionState.current.dragWallNodeIndex = -1;
    interactionState.current.dragEntityId = null;

    if (wasDraggingEntity) {
      syncChannel.setDraggingActive(false);
      const currentFullState = useGameStore.getState().game;
      syncChannel.sendState(currentFullState, true);
      cloudGameSync.flushAutoSave();

      // Computar e integrar memoria de niebla explorada ahora que terminó el arrastre
      const vis = visionManager.getTokensVisibility(currentFullState.entities, currentFullState.grid.size || 70);
      if (vis.length > 0) {
        const store = useGameStore.getState();
        const next = unionExplored(store.game.fog.explored ?? [], vis.map((v) => v.polygon));
        store.setFogExplored(next);
      }
    }
  };

  // 6. Soltar asset o efecto desde la biblioteca al tablero (Drag & Drop)
  const handleDragOver = (e: React.DragEvent) => {
    if (!isMaster) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!isMaster) return;
    e.preventDefault();

    // Comprobar si se soltó un efecto animado
    const effectData = e.dataTransfer.getData('application/vtt-effect');
    if (effectData) {
      try {
        const item = JSON.parse(effectData);
        const { width, height } = getCanvasDimensions();
        const camera = getCamera();
        const localMouse = getLocalPointer(e);
        let worldPos = screenToWorld(localMouse, camera, width, height);

        const currentGridSize = game.grid.size || 70;
        if (game.grid.snapToGrid && currentGridSize > 0) {
          worldPos = snapPointToGrid(worldPos, currentGridSize);
        }

        let effectScale = item.scale || 1;
        if (item.assetId) {
          const asset = await getAsset(item.assetId);
          if (asset) {
            let w = asset.width;
            let h = asset.height;
            if ((!w || !h) && asset.blob) {
              try {
                const dims = await getMediaDimensions(asset.blob);
                if (dims && dims.width > 0 && dims.height > 0) {
                  w = dims.width;
                  h = dims.height;
                  asset.width = w;
                  await persistAssetDimensions(asset.id, w, h);
                }
              } catch (dimErr) {
                console.warn('Error calculando dimensiones al soltar efecto:', dimErr);
              }
            }
            const maxDim = Math.max(w || 0, h || 0);
            if (maxDim > 0) {
              effectScale = parseFloat((currentGridSize / maxDim).toFixed(3));
            }
          }
        }

        const newEffectEntity: Entity = {
          id: `effect_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'effect',
          name: item.name || 'Efecto',
          assetId: item.assetId,
          x: worldPos.x,
          y: worldPos.y,
          rotation: 0,
          scaleX: effectScale,
          scaleY: effectScale,
          zIndex: 25,
          visibleToPlayers: true,
          locked: false,
          effect: {
            preset: item.preset || 'custom',
            category: item.category,
            color: item.color || '#ff7700',
            intensity: item.intensity ?? 80,
            speed: item.speed ?? 1.0,
            emitsLight: !!item.emitsLight,
            baseLightRadius: item.baseLightRadius ?? 3
          },
          light: item.emitsLight
            ? {
                color: item.color || '#ff7700',
                intensity: item.intensity ?? 80,
                brightRadiusInSquares: (item.baseLightRadius ?? 3) * effectScale,
                dimRadiusInSquares: 2 * effectScale,
                edgeHardness: 0.5,
                flicker:
                  item.flicker ??
                  (item.preset === 'torch' ||
                    item.preset === 'campfire' ||
                    item.preset === 'brazier' ||
                    item.preset === 'candle' ||
                    (item.preset || '').startsWith('fire'))
              }
            : undefined
        };

        addEntity(newEffectEntity);
        selectEntity(newEffectEntity.id);
        return;
      } catch (err) {
        console.error('Error al soltar efecto en el tablero:', err);
      }
    }

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
        const existingMaps = game.entities.filter((e) => e.type === 'map');
        const ppg = asset.mapData?.pixelsPerGrid || (asset.width ? asset.width / 10 : 70);
        scale = existingMaps.length === 0 ? 1 : currentGridSize / ppg;
        if (game.grid.snapToGrid && currentGridSize > 0) {
          finalX = Math.round(finalX / currentGridSize) * currentGridSize;
          finalY = Math.round(finalY / currentGridSize) * currentGridSize;
        }
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
        vision: entityType === 'token' ? { active: true, brightRangeInSquares: 4, dimRangeInSquares: 2, hardness: 0.5 } : undefined,
        statuses: []
      };

      addEntity(newEntity);
      selectEntity(newEntity.id);
    } catch (err) {
      console.error('Error al soltar asset en el tablero:', err);
    }
  };

  // Doble clic: abre o cierra puertas (o alterna candado si se presiona Alt)
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isMaster) return;
    const { width, height } = getCanvasDimensions();
    const camera = getCamera();
    const localMouse = getLocalPointer(e);
    const worldPos = screenToWorld(localMouse, camera, width, height);

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

      // 1. Distancia al vano de la puerta (p1 - p2)
      let hit = false;
      const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
      if (l2 > 0) {
        let t = ((worldPos.x - p1.x) * (p2.x - p1.x) + (worldPos.y - p1.y) * (p2.y - p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t * (p2.x - p1.x);
        const projY = p1.y + t * (p2.y - p1.y);
        hit = Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(22 / camera.zoom, 22);
      }

      // 2. Si la puerta está abierta, comprobar también la hoja abierta
      if (!hit && door.isOpen) {
        const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const baseAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const currentAngle = baseAngle + (door.openAngle ?? Math.PI / 2);
        const leafEnd = {
          x: p1.x + Math.cos(currentAngle) * length,
          y: p1.y + Math.sin(currentAngle) * length
        };
        const leafL2 = (leafEnd.x - p1.x) ** 2 + (leafEnd.y - p1.y) ** 2;
        if (leafL2 > 0) {
          let t = ((worldPos.x - p1.x) * (leafEnd.x - p1.x) + (worldPos.y - p1.y) * (leafEnd.y - p1.y)) / leafL2;
          t = Math.max(0, Math.min(1, t));
          const projX = p1.x + t * (leafEnd.x - p1.x);
          const projY = p1.y + t * (leafEnd.y - p1.y);
          hit = Math.hypot(worldPos.x - projX, worldPos.y - projY) <= Math.max(22 / camera.zoom, 22);
        }
      }

      if (hit) {
        if (e.altKey) {
          setDoorLocked(ent.id, !door.isLocked);
        } else if (!door.isLocked) {
          toggleDoor(ent.id);
        }
        selectEntity(ent.id);
        return;
      }
    }
  };

  // Determinar cursor CSS dinámico
  let activeCursor = 'default';
  if (!isMaster) {
    activeCursor = interactionState.current.isPanning ? 'cursor-grabbing' : 'cursor-grab';
  } else if (isSpacePressed || interactionState.current.isPanning) {
    activeCursor = 'cursor-grab active:cursor-grabbing';
  } else if (
    activeTool === 'wall' ||
    activeTool === 'door' ||
    activeTool === 'light' ||
    activeTool === 'ruler' ||
    activeTool === 'fogReveal' ||
    activeTool === 'fogHide'
  ) {
    activeCursor = 'cursor-crosshair';
  } else if (hoverCursor !== 'default') {
    activeCursor = `cursor-${hoverCursor}`;
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div
        ref={containerRef}
        className={`w-full h-full ${activeCursor}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      {isMaster && !isPlayerPreviewMode && selectedEntityIds.length === 1 && (
        <FastActionBar
          selectedEntityId={selectedEntityIds[0]}
          canvasWidth={canvasDimensions.width}
          canvasHeight={canvasDimensions.height}
        />
      )}
    </div>
  );
};
