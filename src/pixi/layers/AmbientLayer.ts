import { Container, Graphics, Sprite } from 'pixi.js';
import { AmbientConfig, ExploredMultiPolygon } from '../../types/game';
import { LightVisibility } from '../../modules/lights/lightManager';
import { visionToMulti, simplifyMulti } from '../../modules/vision/fogMemory';
import { safeClip } from '../../modules/vision/safeClip';
import { parseColor, rgbComponents } from '../../utils/color';
import { getDimRadialGradientTexture, getTintRadialGradientTexture } from '../utils/gradientTextures';

export const AMBIENT_PRESET_CONFIGS: Record<string, { color: string; intensity: number }> = {
  dawn: { color: '#ff9d55', intensity: 0.80 },
  noon: { color: '#ffffff', intensity: 1.00 },
  dusk: { color: '#c84224', intensity: 0.65 },
  night: { color: '#091124', intensity: 0.15 },
  custom: { color: '#ffffff', intensity: 1.00 }
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const { rgb } = parseColor(hex, 0xffffff);
  return rgbComponents(rgb);
}

function rgbToHex(r: number, g: number, b: number): number {
  return ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
}

/**
 * Capa de luz ambiental global y tintado de luces dinámicas.
 * Totalmente vectorial mediante polygon-clipping (sin RenderTexture ni blend modes 'erase').
 * Reduce la oscuridad ambiental dentro de las zonas iluminadas por antorchas y luces.
 */
export class AmbientLayer extends Container {
  private isMaster: boolean;

  private darknessGfx = new Graphics();
  private lightsTintGfx = new Graphics();

  // Contenedor con máscara stencil para degradado radial suave de oscuridad en zona tenue
  private dimContainer = new Container();
  private dimMaskGfx = new Graphics();
  private dimSpritesContainer = new Container();
  private dimSprites: Sprite[] = [];

  // Contenedor con máscara stencil para degradado radial suave de tinte en zona tenue
  private tintDimContainer = new Container();
  private tintDimMaskGfx = new Graphics();
  private tintDimSpritesContainer = new Container();
  private tintDimSprites: Sprite[] = [];

  // Estado para la transición suave de 2 segundos
  private currentR = 255;
  private currentG = 255;
  private currentB = 255;
  private currentIntensity = 1.0;

  private targetR = 255;
  private targetG = 255;
  private targetB = 255;
  private targetIntensity = 1.0;

  private lastGeometryKey = '';
  private cachedRegions: {
    outsideMulti: ExploredMultiPolygon;
    dimMulti: ExploredMultiPolygon;
    brightMulti: ExploredMultiPolygon;
  } | null = null;

  private timeSec = 0;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    // 1. Oscuridad completa fuera de las luces
    this.addChild(this.darknessGfx);

    // 2. Degradado suave de oscuridad en zona tenue
    this.dimContainer.mask = this.dimMaskGfx;
    this.dimContainer.addChild(this.dimMaskGfx);
    this.dimContainer.addChild(this.dimSpritesContainer);
    this.addChild(this.dimContainer);

    // 3. Tinte de luz claro
    this.addChild(this.lightsTintGfx);

    // 4. Degradado suave de tinte en zona tenue
    this.tintDimContainer.mask = this.tintDimMaskGfx;
    this.tintDimContainer.addChild(this.tintDimMaskGfx);
    this.tintDimContainer.addChild(this.tintDimSpritesContainer);
    this.addChild(this.tintDimContainer);
  }

  private renderMulti(gfx: Graphics, multi: ExploredMultiPolygon, color: number, alpha: number) {
    for (const poly of multi) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;
      gfx.poly(outer.flat());
      gfx.fill({ color, alpha });

      for (let i = 1; i < poly.length; i++) {
        const hole = poly[i];
        if (!hole || hole.length < 3) continue;
        gfx.poly(hole.flat());
        gfx.cut();
      }
    }
  }

  public update(
    ambientConfig: AmbientConfig,
    lights: LightVisibility[],
    bounds: { x: number; y: number; width: number; height: number },
    deltaSeconds: number = 0.016
  ) {
    this.timeSec += deltaSeconds;

    // 1. Determinar valores objetivo según preset o personalizado
    const preset = ambientConfig?.preset || 'noon';
    const presetData = AMBIENT_PRESET_CONFIGS[preset] || AMBIENT_PRESET_CONFIGS.noon;
    const targetColorStr = preset === 'custom' ? ambientConfig.color || '#ffffff' : presetData.color;
    const targetTargetIntensity = preset === 'custom' ? (ambientConfig.intensity ?? 1.0) : presetData.intensity;

    const targetRgb = hexToRgb(targetColorStr);
    this.targetR = targetRgb.r;
    this.targetG = targetRgb.g;
    this.targetB = targetRgb.b;
    this.targetIntensity = targetTargetIntensity;

    // 2. Interpolar suavemente durante 2 segundos (tasa dt / 2.0)
    const factor = Math.min(1.0, deltaSeconds / 2.0);
    this.currentR += (this.targetR - this.currentR) * factor;
    this.currentG += (this.targetG - this.currentG) * factor;
    this.currentB += (this.targetB - this.currentB) * factor;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * factor;

    const currentDarkness = Math.max(0, 1.0 - this.currentIntensity);

    // 3. Clave para invalidar cálculo de polígonos (solo si cambian luces o bounds)
    const bx = Number.isFinite(bounds.x) ? Math.round(bounds.x) : -2000;
    const by = Number.isFinite(bounds.y) ? Math.round(bounds.y) : -2000;
    const bw = Number.isFinite(bounds.width) && bounds.width > 0 ? Math.round(bounds.width) : 4000;
    const bh = Number.isFinite(bounds.height) && bounds.height > 0 ? Math.round(bounds.height) : 4000;

    const lightsKey = lights
      .map((l) => `${l.lightId}:${Math.round(l.center.x)}:${Math.round(l.center.y)}:${l.brightRangePx}:${l.totalRangePx}`)
      .join('|');
    const geoKey = `${bx},${by},${bw},${bh}__${lightsKey}`;

    if (geoKey !== this.lastGeometryKey || !this.cachedRegions) {
      this.lastGeometryKey = geoKey;

      const worldBoxMulti: ExploredMultiPolygon = [
        [
          [
            [bx, by],
            [bx + bw, by],
            [bx + bw, by + bh],
            [bx, by + bh],
            [bx, by]
          ]
        ]
      ];

      const brightPolys = lights.map((l) => l.brightPolygon).filter((p) => p && p.length >= 3);
      const totalPolys = lights.map((l) => l.totalPolygon).filter((p) => p && p.length >= 3);

      let brightMulti: ExploredMultiPolygon = [];
      let totalMulti: ExploredMultiPolygon = [];
      let dimMulti: ExploredMultiPolygon = [];
      let outsideMulti: ExploredMultiPolygon = worldBoxMulti;

      if (brightPolys.length > 0) {
        brightMulti = simplifyMulti(safeClip.union(visionToMulti(brightPolys)));
      }
      if (totalPolys.length > 0) {
        totalMulti = simplifyMulti(safeClip.union(visionToMulti(totalPolys)));
      }

      if (totalMulti.length > 0 && brightMulti.length > 0) {
        dimMulti = simplifyMulti(safeClip.difference(totalMulti, brightMulti));
      } else if (totalMulti.length > 0) {
        dimMulti = totalMulti;
      }

      if (totalMulti.length > 0) {
        outsideMulti = simplifyMulti(safeClip.difference(worldBoxMulti, totalMulti));
      }

      this.cachedRegions = { outsideMulti, dimMulti, brightMulti };
    }

    const { outsideMulti, dimMulti, brightMulti } = this.cachedRegions;

    // 4. Dibujar oscuridad ambiental con degradado radial continuo
    this.darknessGfx.clear();
    this.dimMaskGfx.clear();
    const darkColorHex = rgbToHex(this.currentR * 0.15, this.currentG * 0.15, this.currentB * 0.25);

    if (currentDarkness > 0.01) {
      // Oscuridad completa fuera de las luces
      this.renderMulti(this.darknessGfx, outsideMulti, darkColorHex, currentDarkness * 0.95);

      // Zona tenue de las luces: degradado radial suave hasta oscuridad total en el borde exterior
      if (dimMulti.length > 0) {
        // Máscara stencil recortada por dimMulti (paredes y corte claro en seco)
        this.renderMulti(this.dimMaskGfx, dimMulti, 0xffffff, 1.0);

        let darkSpriteIdx = 0;
        for (const light of lights) {
          const rBright = light.brightRangePx || 0;
          const rTotal = light.totalRangePx || 0;
          if (rTotal <= rBright || !light.center) continue;

          let sprite = this.dimSprites[darkSpriteIdx];
          if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            this.dimSprites.push(sprite);
            this.dimSpritesContainer.addChild(sprite);
          }
          sprite.visible = true;

          const ratio = rBright / rTotal;
          sprite.texture = getDimRadialGradientTexture(ratio);
          sprite.tint = darkColorHex;
          sprite.alpha = currentDarkness * 0.95;
          sprite.position.set(light.center.x, light.center.y);
          sprite.width = rTotal * 2;
          sprite.height = rTotal * 2;
          darkSpriteIdx++;
        }
        for (let i = darkSpriteIdx; i < this.dimSprites.length; i++) {
          this.dimSprites[i].visible = false;
        }
      } else {
        for (const s of this.dimSprites) s.visible = false;
      }
    } else {
      for (const s of this.dimSprites) s.visible = false;
    }

    // 5. Dibujar tinte de color de cada luz dinámica (brillo suave y continuo, modulado por la oscuridad del ambiente)
    this.lightsTintGfx.clear();
    this.tintDimMaskGfx.clear();

    const darknessFactor = 0.05 + 0.95 * Math.pow(Math.min(1.0, currentDarkness / 0.85), 1.5);
    let tintSpriteIdx = 0;

    for (const light of lights) {
      const { rgb: colorNum } = parseColor(light.color, 0xffaa44);

      // Parpadeo suave si está activo
      let flickerMod = 1.0;
      if (light.flicker) {
        const seed = Math.sin(Number(light.lightId.slice(-3)) || 1);
        flickerMod = 0.90 + 0.10 * Math.sin(this.timeSec * 8 + seed) * Math.cos(this.timeSec * 13 + seed);
      }

      // Brillo suave: alpha en el centro de ~0.25
      const baseAlpha = light.intensity * 0.25 * darknessFactor * flickerMod;

      // Zona clara iluminada hasta su radio (recortada con su polígono de luz clara)
      if (light.brightPolygon && light.brightPolygon.length >= 3) {
        this.lightsTintGfx.poly(light.brightPolygon.map((p) => [p.x, p.y]).flat());
        this.lightsTintGfx.fill({ color: colorNum, alpha: baseAlpha });
      }

      // Zona tenue: degradado radial continuo hasta apagarse en el borde exterior
      if (light.totalPolygon && light.totalPolygon.length >= 3) {
        const rBright = light.brightRangePx || 0;
        const rTotal = light.totalRangePx || 0;

        if (rTotal > rBright && light.center) {
          // Máscara stencil con el polígono total (paredes cortan en seco)
          this.tintDimMaskGfx.poly(light.totalPolygon.map((p) => [p.x, p.y]).flat());
          this.tintDimMaskGfx.fill({ color: 0xffffff, alpha: 1.0 });

          let sprite = this.tintDimSprites[tintSpriteIdx];
          if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            this.tintDimSprites.push(sprite);
            this.tintDimSpritesContainer.addChild(sprite);
          }
          sprite.visible = true;

          const ratio = rBright / rTotal;
          sprite.texture = getTintRadialGradientTexture(ratio);
          sprite.tint = colorNum;
          sprite.alpha = baseAlpha;
          sprite.position.set(light.center.x, light.center.y);
          sprite.width = rTotal * 2;
          sprite.height = rTotal * 2;
          tintSpriteIdx++;
        }
      }
    }
    for (let i = tintSpriteIdx; i < this.tintDimSprites.length; i++) {
      this.tintDimSprites[i].visible = false;
    }
  }
}
