import { Container, Graphics, Renderer, Sprite } from 'pixi.js';
import { ExploredMultiPolygon } from '../../types/game';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { exploredSignature } from '../../modules/vision/fogMemory';
import { computeFogRegions } from '../../modules/vision/fogRegions';
import { getDimRadialGradientTexture, getTintRadialGradientTexture } from '../utils/gradientTextures';
import { DarknessInvertFilter } from '../filters/DarknessInvertFilter';

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

  // Contenedor con máscara stencil para degradado radial suave de visión tenue
  private dimContainer = new Container();
  private dimMaskGfx = new Graphics();
  private dimSpritesContainer = new Container();
  private dimSprites: Sprite[] = [];
  private darknessFilter: DarknessInvertFilter | null = null;

  private lastKey = '';

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.addChild(this.unexploredGfx);
    this.addChild(this.exploredDarkGfx);

    this.dimContainer.mask = this.dimMaskGfx;
    this.dimContainer.addChild(this.dimMaskGfx);
    this.dimContainer.addChild(this.dimSpritesContainer);

    if (typeof document !== 'undefined') {
      try {
        this.darknessFilter = new DarknessInvertFilter(2 / 255, 6 / 255, 23 / 255, 1.0);
        this.dimContainer.filters = [this.darknessFilter];
      } catch (e) {
        console.warn('DarknessInvertFilter initialization fallback:', e);
      }
    }

    this.addChild(this.dimContainer);
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
    rememberExplored = false,
    lights: any[] = []
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
    const lightsKey = lights
      .map(
        (l) =>
          `${l.lightId}:${Math.round(l.center?.x || 0)}:${Math.round(l.center?.y || 0)}:${l.brightPolygon?.length || 0}:${l.totalPolygon?.length || 0}`
      )
      .join('|');
    const key = `${exploredSignature(explored)}#${exploredSignature(revealed)}#${rememberExplored}#${visKey}#${lightsKey}#${Math.round(bx)},${Math.round(by)},${Math.round(bw)},${Math.round(bh)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const regions = computeFogRegions(
      explored,
      visibilities,
      { x: bx, y: by, width: bw, height: bh },
      revealed,
      rememberExplored,
      lights
    );

    // 1. Dibuja noExplorado con negro opaco
    this.unexploredGfx.clear();
    this.renderMultiPolygon(this.unexploredGfx, regions.noExplorado, FOG_COLOR, 1.0);

    // 2. Dibuja exploradoNoVisible con negro al 65% (si rememberExplored es false, estará vacío)
    this.exploredDarkGfx.clear();
    this.renderMultiPolygon(this.exploredDarkGfx, regions.exploradoNoVisible, FOG_COLOR, EXPLORED_ALPHA);

    // 3. Dibuja visibleDim (zona tenue de tokens y luces) con degradado radial continuo hacia negro total
    this.dimMaskGfx.clear();

    if (regions.visibleDim.length > 0) {
      // Máscara stencil recortada por visibleDim (paredes y huecos claros cortan en seco)
      this.renderMultiPolygon(this.dimMaskGfx, regions.visibleDim, 0xffffff, 1.0);

      const sources: { center: { x: number; y: number }; rBright: number; rTotal: number }[] = [];
      for (const v of visibilities) {
        if (v.center && v.totalRangePx > 0) {
          sources.push({ center: v.center, rBright: v.brightRangePx || 0, rTotal: v.totalRangePx });
        }
      }
      for (const l of lights) {
        if (l.center && l.totalRangePx > 0) {
          sources.push({ center: l.center, rBright: l.brightRangePx || 0, rTotal: l.totalRangePx });
        }
      }

      let spriteIdx = 0;
      for (const src of sources) {
        const rBright = src.rBright || 0;
        const rTotal = src.rTotal || 0;
        if (rTotal <= rBright) continue;

        let sprite = this.dimSprites[spriteIdx];
        if (!sprite) {
          sprite = new Sprite();
          sprite.anchor.set(0.5);
          this.dimSprites.push(sprite);
          this.dimSpritesContainer.addChild(sprite);
        }
        sprite.visible = true;

        const ratio = rBright / rTotal;
        if (this.darknessFilter) {
          // Con filtro de inversión: la textura representa iluminación (1 en claro, 0 en borde)
          // y el modo 'max' garantiza que en solapes manda el que más ilumina sin líneas de corte
          sprite.texture = getTintRadialGradientTexture(ratio);
          sprite.tint = 0xffffff;
          sprite.alpha = 1.0;
          sprite.blendMode = 'max';
        } else {
          sprite.texture = getDimRadialGradientTexture(ratio);
          sprite.tint = FOG_COLOR;
          sprite.alpha = 1.0;
          sprite.blendMode = 'normal';
        }

        sprite.position.set(src.center.x, src.center.y);
        sprite.width = rTotal * 2;
        sprite.height = rTotal * 2;
        spriteIdx++;
      }

      for (let i = spriteIdx; i < this.dimSprites.length; i++) {
        this.dimSprites[i].visible = false;
      }
    } else {
      for (const s of this.dimSprites) {
        s.visible = false;
      }
    }
  }
}
