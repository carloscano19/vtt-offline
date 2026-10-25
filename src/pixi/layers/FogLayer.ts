import { Container, Graphics, Renderer } from 'pixi.js';
import { ExploredMultiPolygon } from '../../types/game';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { exploredSignature } from '../../modules/vision/fogMemory';
import { computeFogRegions } from '../../modules/vision/fogRegions';

const FOG_COLOR = 0x020617;
const EXPLORED_ALPHA = 0.65;

/**
 * Capa de niebla de guerra. Utiliza regiones calculadas mediante álgebra booleana de polígonos
 * (polygon-clipping), de forma que visible, exploradoNoVisible y noExplorado son completamente
 * disjuntas. Cada polígono resultante se dibuja con fill normal y sus propios huecos con cut().
 * La fuente única de exploración es el estado de la partida (game.fog.explored).
 */
export class FogLayer extends Container {
  private isMaster: boolean;

  private unexploredGfx = new Graphics();
  private exploredDarkGfx = new Graphics();

  private lastKey = '';

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.addChild(this.unexploredGfx);
    this.addChild(this.exploredDarkGfx);
  }

  private renderMultiPolygon(graphics: Graphics, multi: ExploredMultiPolygon, color: number, alpha: number) {
    for (const poly of multi) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;

      // Rellenar contorno exterior
      graphics.poly(outer.flat());
      graphics.fill({ color, alpha });

      // Cortar únicamente los huecos propios de este polígono resultante
      for (let i = 1; i < poly.length; i++) {
        const hole = poly[i];
        if (!hole || hole.length < 3) continue;
        graphics.poly(hole.flat());
        graphics.cut();
      }
    }
  }

  public update(
    _renderer: Renderer,
    fogEnabled: boolean,
    isPlayerPreview: boolean,
    visibilities: TokenVisibility[],
    explored: ExploredMultiPolygon,
    bounds: { x: number; y: number; width: number; height: number },
    _gridSize: number
  ) {
    const shouldRenderFog = fogEnabled && (!this.isMaster || isPlayerPreview);
    if (!shouldRenderFog) {
      this.visible = false;
      return;
    }
    this.visible = true;

    // Validación defensiva de bounds
    const bx = Number.isFinite(bounds.x) ? bounds.x : -2000;
    const by = Number.isFinite(bounds.y) ? bounds.y : -2000;
    const bw = Number.isFinite(bounds.width) && bounds.width > 0 ? bounds.width : 4000;
    const bh = Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : 4000;

    const visKey = visibilities
      .map((v) => `${v.tokenId}:${Math.round(v.center.x)}:${Math.round(v.center.y)}:${v.polygon.length}`)
      .join('|');
    const key = `${exploredSignature(explored)}#${visKey}#${Math.round(bx)},${Math.round(by)},${Math.round(bw)},${Math.round(bh)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const visionPolygons = visibilities.map((v) => v.polygon).filter((p) => p.length >= 3);
    const regions = computeFogRegions(explored, visionPolygons, { x: bx, y: by, width: bw, height: bh });

    // 1. Dibuja noExplorado con negro opaco
    this.unexploredGfx.clear();
    this.renderMultiPolygon(this.unexploredGfx, regions.noExplorado, FOG_COLOR, 1.0);

    // 2. Dibuja exploradoNoVisible con negro al 65%
    this.exploredDarkGfx.clear();
    this.renderMultiPolygon(this.exploredDarkGfx, regions.exploradoNoVisible, FOG_COLOR, EXPLORED_ALPHA);
  }
}
