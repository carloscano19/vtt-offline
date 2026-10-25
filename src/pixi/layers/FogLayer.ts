import { BlurFilter, Container, Graphics, RenderTexture, Renderer, Sprite } from 'pixi.js';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { exploredSignature } from '../../modules/vision/fogMemory';

const MAX_TEXTURE_SIDE = 3072;
const FOG_COLOR = 0x020617;
const EXPLORED_ALPHA = 0.65;

const flat = (pts: Point2D[]) => {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
};

/**
 * Capa de niebla de guerra. Se dibuja en una RenderTexture que solo se regenera
 * cuando cambia la visión actual o la memoria de exploración (game.fog.explored).
 * No guarda estado de exploración: la fuente única es el estado de la partida.
 */
export class FogLayer extends Container {
  private isMaster: boolean;

  private fogRT: RenderTexture | null = null;
  private visRT: RenderTexture | null = null;
  private fogSprite: Sprite;

  // Escena offscreen de la niebla
  private scene = new Container();
  private baseGfx = new Graphics();
  private exploredEraseGfx = new Graphics();
  private exploredDarkGfx = new Graphics();
  private visMaskSprite: Sprite;

  // Escena offscreen de la máscara de visión actual (con desenfoque en el borde)
  private visScene = new Container();
  private visGroups: Container[] = [];

  private lastKey = '';

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.fogSprite = new Sprite();
    this.addChild(this.fogSprite);

    this.exploredEraseGfx.blendMode = 'erase';
    this.visMaskSprite = new Sprite();
    this.visMaskSprite.blendMode = 'erase';

    this.scene.addChild(this.baseGfx, this.exploredEraseGfx, this.exploredDarkGfx, this.visMaskSprite);
  }

  private ensureTextures(w: number, h: number) {
    if (!this.fogRT) {
      this.fogRT = RenderTexture.create({ width: w, height: h });
      this.visRT = RenderTexture.create({ width: w, height: h });
    } else if (this.fogRT.width !== w || this.fogRT.height !== h) {
      this.fogRT.resize(w, h);
      this.visRT!.resize(w, h);
    }
    this.fogSprite.texture = this.fogRT;
    this.visMaskSprite.texture = this.visRT!;
  }

  private drawMulti(g: Graphics, multi: ExploredMultiPolygon) {
    for (const poly of multi) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;
      g.poly(outer.flat());
      g.fill({ color: FOG_COLOR });
      for (let i = 1; i < poly.length; i++) {
        g.poly(poly[i].flat());
        g.cut();
      }
    }
  }

  public update(
    renderer: Renderer,
    fogEnabled: boolean,
    isPlayerPreview: boolean,
    visibilities: TokenVisibility[],
    explored: ExploredMultiPolygon,
    bounds: { x: number; y: number; width: number; height: number },
    gridSize: number
  ) {
    const shouldRenderFog = fogEnabled && (!this.isMaster || isPlayerPreview);
    if (!shouldRenderFog) {
      this.visible = false;
      return;
    }
    this.visible = true;

    const visKey = visibilities
      .map((v) => `${v.tokenId}:${Math.round(v.center.x)}:${Math.round(v.center.y)}:${v.polygon.length}:${v.hardness}:${Math.round(v.rangePx)}`)
      .join('|');
    const key = `${exploredSignature(explored)}#${visKey}#${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)}#${gridSize}`;
    if (key === this.lastKey) return; // nada cambió: no se regenera la textura
    this.lastKey = key;

    // Resolución de la textura: limitada para no exceder memoria GPU
    const s = Math.min(1, MAX_TEXTURE_SIDE / Math.max(bounds.width, bounds.height));
    const w = Math.max(1, Math.ceil(bounds.width * s));
    const h = Math.max(1, Math.ceil(bounds.height * s));
    this.ensureTextures(w, h);

    this.fogSprite.position.set(bounds.x, bounds.y);
    this.fogSprite.scale.set(1 / s);

    // 1. Máscara de visión actual (blur proporcional a (1 - dureza), solo en el borde de lo visible ahora)
    for (const g of this.visGroups) {
      this.visScene.removeChild(g);
      g.destroy({ children: true });
    }
    this.visGroups = [];
    for (const v of visibilities) {
      if (v.polygon.length < 3) continue;
      const group = new Container();
      const gfx = new Graphics();
      gfx.poly(flat(v.polygon));
      gfx.fill({ color: 0xffffff });
      group.addChild(gfx);
      const blur = (1 - v.hardness) * gridSize * 0.5 * s;
      if (blur > 0.5) {
        group.filters = [new BlurFilter({ strength: blur, quality: 3 })];
      }
      this.visScene.addChild(group);
      this.visGroups.push(group);
    }
    this.visScene.scale.set(s);
    this.visScene.position.set(-bounds.x * s, -bounds.y * s);
    renderer.render({ container: this.visScene, target: this.visRT!, clear: true, clearColor: [0, 0, 0, 0] });

    // 2. Niebla: negro total, se perfora lo explorado, se pinta lo explorado oscurecido y se perfora lo visible
    this.baseGfx.clear();
    this.baseGfx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.baseGfx.fill({ color: FOG_COLOR, alpha: 1 });

    this.exploredEraseGfx.clear();
    this.drawMulti(this.exploredEraseGfx, explored);

    this.exploredDarkGfx.clear();
    this.drawMulti(this.exploredDarkGfx, explored);
    this.exploredDarkGfx.alpha = EXPLORED_ALPHA;

    // La máscara visRT ya está en coordenadas de textura: se coloca sin la transformación de la escena
    this.visMaskSprite.scale.set(1 / s);
    this.visMaskSprite.position.set(bounds.x, bounds.y);

    this.scene.scale.set(s);
    this.scene.position.set(-bounds.x * s, -bounds.y * s);
    renderer.render({ container: this.scene, target: this.fogRT!, clear: true, clearColor: [0, 0, 0, 0] });
  }
}
