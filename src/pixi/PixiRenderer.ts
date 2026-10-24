import { Application, Container } from 'pixi.js';
import { GameState, RulerState } from '../types/game';
import { Point2D } from '../types/entity';
import { MapsLayer } from './layers/MapsLayer';
import { DebugVttLayer } from './layers/DebugVttLayer';
import { GridLayer } from './layers/GridLayer';
import { TokensLayer } from './layers/TokensLayer';
import { RulerLayer } from './layers/RulerLayer';
import { GizmoLayer } from './layers/GizmoLayer';
import { WallsLayer } from './layers/WallsLayer';

export class PixiRenderer {
  public app!: Application;
  public worldContainer!: Container;

  public mapsLayer!: MapsLayer;
  public debugVttLayer!: DebugVttLayer;
  public gridLayer!: GridLayer;
  public tokensLayer!: TokensLayer;
  public rulerLayer!: RulerLayer;
  public gizmoLayer!: GizmoLayer;
  public wallsLayer!: WallsLayer;

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
        // Si fue destruido mientras se inicializaba, limpiar inmediatamente
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

      // 4. Capa de Tokens y Objetos
      this.tokensLayer = new TokensLayer(this.isMaster);
      this.tokensLayer.label = 'TokensLayer';
      this.worldContainer.addChild(this.tokensLayer);

      // (Hooks para Fases 2, 3, 4):
      // Fase 2: Vision & FogOfWar
      // Fase 3: Dynamic Lighting & Filters
      // Fase 4: Status Icons

      // 5. Capa de Paredes Invisibles Dibujadas (Solo Máster)
      this.wallsLayer = new WallsLayer(this.isMaster);
      this.wallsLayer.label = 'WallsLayer';
      this.worldContainer.addChild(this.wallsLayer);

      // 6. Capa de Regla
      this.rulerLayer = new RulerLayer(this.isMaster);
      this.rulerLayer.label = 'RulerLayer';
      this.worldContainer.addChild(this.rulerLayer);

      // 7. Capa de Gizmos de transformación (Solo Máster)
      this.gizmoLayer = new GizmoLayer(this.isMaster);
      this.gizmoLayer.label = 'GizmoLayer';
      this.gizmoLayer.setTokensLayer(this.tokensLayer);
      this.worldContainer.addChild(this.gizmoLayer);

      this.isInitialized = true;
    })();

    await this.initPromise;
  }

  public sync(
    game: GameState,
    ruler: RulerState,
    selectedIds: string[] = [],
    showDebugOverlay = true,
    activeDraftWallPoints: Point2D[] = []
  ) {
    if (!this.isInitialized || this.isDestroyed || !this.app || !this.app.renderer) return;

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const camera = this.isMaster ? game.masterCamera : game.playerCamera;

    // Actualizar transformaciones de la cámara en el contenedor del mundo
    const zoom = Math.max(0.1, camera.zoom);
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = width / 2 - camera.x * zoom;
    this.worldContainer.y = height / 2 - camera.y * zoom;

    // Sincronizar capas
    this.mapsLayer.syncEntities(game.entities);
    this.debugVttLayer.update(game.entities, showDebugOverlay);
    this.gridLayer.update(game.grid, camera, width, height);
    this.tokensLayer.syncEntities(game.entities, selectedIds);
    this.wallsLayer.update(game.entities, selectedIds, activeDraftWallPoints);
    this.rulerLayer.update(ruler, game.grid.size);

    const selectedEntities = game.entities.filter((e) => selectedIds.includes(e.id));
    this.gizmoLayer.update(selectedEntities);
  }

  public async destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Si la inicialización sigue en curso, esperar a que termine antes de destruir
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // Ignorar fallo de init si se interrumpió
      }
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
