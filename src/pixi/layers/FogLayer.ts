import { Container, Graphics, Renderer } from 'pixi.js';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { exploredSignature } from '../../modules/vision/fogMemory';

const FOG_COLOR = 0x020617;
const EXPLORED_ALPHA = 0.65;

const flat = (pts: Point2D[]) => {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
};

/**
 * Capa de niebla de guerra. Utiliza recorte geométrico con Graphics.cut()
 * sin blend modes ('erase') ni RenderTextures que fallen en WebGL/Metal.
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

    // 1. Niebla inexplorada (negro 100% opaco):
    // Cubre todo el área de los límites del mundo, pero perfora lo explorado y lo visible en tiempo real.
    this.unexploredGfx.clear();
    this.unexploredGfx.rect(bx, by, bw, bh);
    this.unexploredGfx.fill({ color: FOG_COLOR, alpha: 1.0 });

    for (const poly of explored) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;
      this.unexploredGfx.poly(outer.flat());
      this.unexploredGfx.cut();
    }

    for (const vis of visibilities) {
      if (vis.polygon.length < 3) continue;
      this.unexploredGfx.poly(flat(vis.polygon));
      this.unexploredGfx.cut();
    }

    // 2. Niebla explorada (semi-transparente 65% opaco):
    // Pinta las zonas exploradas pero perfora la visión visible en tiempo real.
    this.exploredDarkGfx.clear();
    for (const poly of explored) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;

      this.exploredDarkGfx.poly(outer.flat());
      this.exploredDarkGfx.fill({ color: FOG_COLOR, alpha: EXPLORED_ALPHA });

      for (let i = 1; i < poly.length; i++) {
        if (poly[i].length < 3) continue;
        this.exploredDarkGfx.poly(poly[i].flat());
        this.exploredDarkGfx.cut();
      }

      for (const vis of visibilities) {
        if (vis.polygon.length < 3) continue;
        this.exploredDarkGfx.poly(flat(vis.polygon));
        this.exploredDarkGfx.cut();
      }
    }
  }
}
