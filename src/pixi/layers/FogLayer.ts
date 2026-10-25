import { Container, Graphics, Renderer } from 'pixi.js';
import { ExploredMultiPolygon } from '../../types/game';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { exploredSignature } from '../../modules/vision/fogMemory';
import { computeFogRegions } from '../../modules/vision/fogRegions';

const FOG_COLOR = 0x020617;
const EXPLORED_ALPHA = 0.65;
const DIM_ALPHA = 0.50;

/**
 * Capa de niebla de guerra. Utiliza regiones calculadas mediante álgebra booleana de polígonos
 * (polygon-clipping), de forma que visibleBright, visibleDim, exploradoNoVisible y noExplorado son completamente
 * disjuntas. Cada polígono resultante se dibuja con fill normal y sus propios huecos con cut().
 */
export class FogLayer extends Container {
  private isMaster: boolean;

  private unexploredGfx = new Graphics();
  private exploredDarkGfx = new Graphics();
  private dimDarkGfx = new Graphics();

  private lastKey = '';

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.addChild(this.unexploredGfx);
    this.addChild(this.exploredDarkGfx);
    this.addChild(this.dimDarkGfx);
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
    _gridSize: number,
    revealed: ExploredMultiPolygon = [],
    rememberExplored = false
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
      .map(
        (v) =>
          `${v.tokenId}:${Math.round(v.center.x)}:${Math.round(v.center.y)}:${v.brightPolygon?.length || 0}:${v.totalPolygon?.length || 0}`
      )
      .join('|');
    const key = `${exploredSignature(explored)}#${exploredSignature(revealed)}#${rememberExplored}#${visKey}#${Math.round(bx)},${Math.round(by)},${Math.round(bw)},${Math.round(bh)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const regions = computeFogRegions(
      explored,
      visibilities,
      { x: bx, y: by, width: bw, height: bh },
      revealed,
      rememberExplored
    );

    // 1. Dibuja noExplorado con negro opaco
    this.unexploredGfx.clear();
    this.renderMultiPolygon(this.unexploredGfx, regions.noExplorado, FOG_COLOR, 1.0);

    // 2. Dibuja exploradoNoVisible con negro al 65% (si rememberExplored es false, estará vacío)
    this.exploredDarkGfx.clear();
    this.renderMultiPolygon(this.exploredDarkGfx, regions.exploradoNoVisible, FOG_COLOR, EXPLORED_ALPHA);

    // 3. Dibuja visibleDim (zona tenue de tokens) con negro al 50%
    this.dimDarkGfx.clear();
    this.renderMultiPolygon(this.dimDarkGfx, regions.visibleDim, FOG_COLOR, DIM_ALPHA);
  }
}
