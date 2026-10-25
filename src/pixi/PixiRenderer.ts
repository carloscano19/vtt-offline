import { Application, Container, Graphics, Renderer } from 'pixi.js';
import { GameState, RulerState } from '../types/game';
import { Point2D } from '../types/entity';
import { MapsLayer } from './layers/MapsLayer';
import { DebugVttLayer } from './layers/DebugVttLayer';
import { GridLayer } from './layers/GridLayer';
import { TokensLayer } from './layers/TokensLayer';
import { RulerLayer } from './layers/RulerLayer';
import { GizmoLayer } from './layers/GizmoLayer';
import { WallsLayer } from './layers/WallsLayer';
import { DoorsLayer } from './layers/DoorsLayer';
import { FogLayer } from './layers/FogLayer';
import { PlayerFrameLayout } from './layers/PlayerFrameLayout';
import { visionManager } from '../modules/vision/visionManager';

export class PixiRenderer {
  public app!: Application;
  public worldContainer!: Container;

  public mapsLayer!: MapsLayer;
  public debugVttLayer!: DebugVttLayer;
  public gridLayer!: GridLayer;
  public tokensLayer!: TokensLayer;
  public doorsLayer!: DoorsLayer;
  public wallsLayer!: WallsLayer;
  public fogLayer!: FogLayer;
  public rulerLayer!: RulerLayer;
  public gizmoLayer!: GizmoLayer;
  public playerFrameLayout!: PlayerFrameLayout;

  private isMaster: boolean;
  public isInitialized = false;
  public isDestroyed = false;
  private initPromise: Promise<void> | null = null;

  constructor(isMaster: boolean) {
    this.isMaster = isMaster;
  }

  public async init(canvas: HTMLCanvasElement, resizeTo: HTMLElement) {
    if (this.isDestroyed) return;

    this.app = new Application();
    this.initPromise = (async () => {
      await this.app.init({
        canvas,
        resizeTo,
        backgroundColor: 0x090d16,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      });

      if (this.isDestroyed) {
        try {
          if (this.app.renderer) {
            this.app.destroy({ removeView: false }, { children: true });
          }
        } catch (e) {
          console.warn('[PixiRenderer] Limpieza tras destrucción temprana:', e);
        }
        return;
      }

      this.worldContainer = new Container();
      this.worldContainer.label = 'WorldContainer';
      this.app.stage.addChild(this.worldContainer);

      // 1. Capa de Mapas
      this.mapsLayer = new MapsLayer(this.isMaster);
      this.mapsLayer.label = 'MapsLayer';
      this.worldContainer.addChild(this.mapsLayer);

      // 2. Capa de Depuración UVTT (Paredes, Portales, Luces - Solo Máster)
      this.debugVttLayer = new DebugVttLayer(this.isMaster);
      this.debugVttLayer.label = 'DebugVttLayer';
      this.worldContainer.addChild(this.debugVttLayer);

      // 3. Capa de Cuadrícula
      this.gridLayer = new GridLayer();
      this.gridLayer.label = 'GridLayer';
      this.worldContainer.addChild(this.gridLayer);

      // 4. Capa de Puertas (animadas con bisagra)
      this.doorsLayer = new DoorsLayer(this.isMaster);
      this.doorsLayer.label = 'DoorsLayer';
      this.worldContainer.addChild(this.doorsLayer);

      // 5. Capa de Tokens y Objetos
      this.tokensLayer = new TokensLayer(this.isMaster);
      this.tokensLayer.label = 'TokensLayer';
      this.worldContainer.addChild(this.tokensLayer);

      // 6. Capa de Niebla de Guerra (Fog of War)
      this.fogLayer = new FogLayer(this.isMaster);
      this.fogLayer.label = 'FogLayer';
      this.worldContainer.addChild(this.fogLayer);

      // 7. Capa de Paredes Invisibles Dibujadas (Solo Máster)
      this.wallsLayer = new WallsLayer(this.isMaster);
      this.wallsLayer.label = 'WallsLayer';
      this.worldContainer.addChild(this.wallsLayer);

      // 8. Capa de Regla
      this.rulerLayer = new RulerLayer(this.isMaster);
      this.rulerLayer.label = 'RulerLayer';
      this.worldContainer.addChild(this.rulerLayer);

      // 9. Capa de Gizmos de transformación (Solo Máster)
      this.gizmoLayer = new GizmoLayer(this.isMaster);
      this.gizmoLayer.label = 'GizmoLayer';
      this.gizmoLayer.setTokensLayer(this.tokensLayer);
      this.worldContainer.addChild(this.gizmoLayer);

      // 10. Marco de TV de jugadores (Solo Máster)
      this.playerFrameLayout = new PlayerFrameLayout(this.isMaster);
      this.playerFrameLayout.label = 'PlayerFrameLayout';
      this.worldContainer.addChild(this.playerFrameLayout);

      this.isInitialized = true;
    })();

    await this.initPromise;
  }

  public sync(
    game: GameState,
    ruler: RulerState,
    selectedIds: string[] = [],
    showDebugOverlay = true,
    activeDraftWallPoints: Point2D[] = [],
    isPlayerPreview = false,
    showPlayerFrame = true
  ) {
    if (!this.isInitialized || this.isDestroyed || !this.app || !this.app.renderer) return;

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const camera = this.isMaster
      ? isPlayerPreview
        ? game.playerCamera
        : game.masterCamera
      : game.playerCamera;

    // Actualizar transformaciones de la cámara en el contenedor del mundo
    const zoom = Math.max(0.05, camera.zoom);
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = width / 2 - camera.x * zoom;
    this.worldContainer.y = height / 2 - camera.y * zoom;

    // 1. Calcular o recuperar polígonos de visión de tokens de jugador
    const gridSize = game.grid.size || 70;
    const visibilities = visionManager.getTokensVisibility(game.entities, gridSize);

    // Calcular límites envolventes de los mapas visibles para jugadores
    let minX = -2000, minY = -2000, maxX = 4000, maxY = 4000;
    const playerVisibleMaps = game.entities.filter(
      (e) => e.type === 'map' && e.visibleToPlayers !== false
    );
    const targetMaps = playerVisibleMaps.length > 0 ? playerVisibleMaps : game.entities.filter((e) => e.type === 'map');
    if (targetMaps.length > 0) {
      minX = Math.min(...targetMaps.map((m) => m.x)) - 1000;
      minY = Math.min(...targetMaps.map((m) => m.y)) - 1000;
      maxX = Math.max(...targetMaps.map((m) => m.x + (m.mapData?.gridWidth ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleX)) + 1000;
      maxY = Math.max(...targetMaps.map((m) => m.y + (m.mapData?.gridHeight ?? 10) * (m.mapData?.pixelsPerGrid ?? 70) * m.scaleY)) + 1000;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      minX = -2000;
      minY = -2000;
      maxX = 4000;
      maxY = 4000;
    }
    const worldBounds = {
      x: minX,
      y: minY,
      width: Math.max(100, maxX - minX),
      height: Math.max(100, maxY - minY)
    };

    // Sincronizar capas
    this.mapsLayer.syncEntities(game.entities);
    this.debugVttLayer.update(game.entities, showDebugOverlay && !isPlayerPreview);

    // Vista de jugadores con niebla: la cuadrícula queda por debajo de la niebla y
    // se dibuja solo dentro de los límites del mapa para no proyectar líneas en el vacío.
    const clipGrid = (!this.isMaster || isPlayerPreview) && game.fog.enabled;
    this.gridLayer.update(game.grid, camera, width, height, clipGrid ? worldBounds : undefined);
    this.doorsLayer.update(game.entities, selectedIds);
    this.tokensLayer.syncEntities(game.entities, selectedIds, visibilities, isPlayerPreview, game.fog.enabled);
    this.fogLayer.update(
      this.app.renderer as Renderer,
      game.fog.enabled,
      isPlayerPreview,
      visibilities,
      game.fog.explored ?? [],
      worldBounds,
      gridSize
    );
    this.wallsLayer.update(game.entities, selectedIds, activeDraftWallPoints);
    this.rulerLayer.update(ruler, game.grid.size);

    const selectedEntities = game.entities.filter((e) => selectedIds.includes(e.id));
    this.gizmoLayer.update(isPlayerPreview ? [] : selectedEntities);

    // Marco verde de la pantalla de jugadores
    this.playerFrameLayout.update(game.playerCamera, game.playerViewport, showPlayerFrame && !isPlayerPreview);
  }

  public async destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {}
    }

    if (this.app && this.app.renderer) {
      try {
        this.app.destroy({ removeView: false }, { children: true });
      } catch (err) {
        console.warn('[PixiRenderer] Error durante destroy:', err);
      }
    }
  }
}
