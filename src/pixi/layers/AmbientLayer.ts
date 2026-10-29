import { Container, Graphics, Sprite } from 'pixi.js';
import { AmbientConfig, ExploredMultiPolygon } from '../../types/game';
import { LightVisibility } from '../../modules/lights/lightManager';
import { visionToMulti, simplifyMulti } from '../../modules/vision/fogMemory';
import { safeClip } from '../../modules/vision/safeClip';
import { parseColor, rgbComponents } from '../../utils/color';
import { getDimRadialGradientTexture, getTintRadialGradientTexture, getConeTintGradientTexture } from '../utils/gradientTextures';
import { DarknessInvertFilter } from '../filters/DarknessInvertFilter';

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

  // Contenedor con máscara stencil para degradado radial suave de oscuridad en zona iluminada
  private dimContainer = new Container();
  private dimMaskGfx = new Graphics();
  private dimSpritesContainer = new Container();
  private dimSprites: Sprite[] = [];
  private darknessFilter: DarknessInvertFilter | null = null;

  // Contenedor con máscara stencil para haz continuo de luz con degradado suave
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
    totalMulti: ExploredMultiPolygon;
  } | null = null;

  // Mapa de transición suave de visibilidad (0.6s) para cada luz en la tele
  private lightFadeMap = new Map<string, { current: number; target: number }>();

  private timeSec = 0;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    // 1. Oscuridad completa fuera de las luces
    this.addChild(this.darknessGfx);

    // 2. Degradado suave de oscuridad en todas las zonas iluminadas
    this.dimContainer.mask = this.dimMaskGfx;
    this.dimContainer.addChild(this.dimMaskGfx);
    this.dimContainer.addChild(this.dimSpritesContainer);

    if (typeof document !== 'undefined') {
      try {
        this.darknessFilter = new DarknessInvertFilter(0, 0, 0, 1.0);
        this.dimContainer.filters = [this.darknessFilter];
      } catch (e) {
        console.warn('DarknessInvertFilter initialization fallback in AmbientLayer:', e);
      }
    }

    this.addChild(this.dimContainer);

    // 3. Haz continuo de tinte de luz (sin polígonos planos ni cortes en radio claro)
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
      .map(
        (l) =>
          `${l.lightId}:${Math.round(l.center.x)}:${Math.round(l.center.y)}:${l.brightRangePx}:${l.totalRangePx}:${l.shape || 'circle'}:${l.coneAngle || 60}:${l.directionOffset || 0}:${Math.round((l.rotation || 0) * 100) / 100}`
      )
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

      const totalPolys = lights.map((l) => l.totalPolygon).filter((p) => p && p.length >= 3);

      let totalMulti: ExploredMultiPolygon = [];
      let outsideMulti: ExploredMultiPolygon = worldBoxMulti;

      if (totalPolys.length > 0) {
        totalMulti = simplifyMulti(safeClip.union(visionToMulti(totalPolys)));
        outsideMulti = simplifyMulti(safeClip.difference(worldBoxMulti, totalMulti));
      }

      this.cachedRegions = { outsideMulti, totalMulti };

      // 4a. Regenerar geometría estática de oscuridad fuera de las luces
      this.darknessGfx.clear();
      this.renderMulti(this.darknessGfx, outsideMulti, 0xffffff, 1.0);

      // 4b. Regenerar máscara stencil única para degradado de oscuridad de todas las luces
      this.dimMaskGfx.clear();
      if (totalMulti.length > 0) {
        this.renderMulti(this.dimMaskGfx, totalMulti, 0xffffff, 1.0);

        let darkSpriteIdx = 0;
        for (const light of lights) {
          const rBright = light.brightRangePx || 0;
          const rTotal = light.totalRangePx || 0;
          if (rTotal <= 0 || !light.center) continue;

          let sprite = this.dimSprites[darkSpriteIdx];
          if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            this.dimSprites.push(sprite);
            this.dimSpritesContainer.addChild(sprite);
          }
          const ratio = rTotal > 0 ? rBright / rTotal : 1.0;
          const isCone = light.shape === 'cone';
          const coneAngle = light.coneAngle ?? 60;
          const totalAngleRad = (light.rotation || 0) + ((light.directionOffset || 0) * Math.PI) / 180;

          if (this.darknessFilter) {
            sprite.texture = isCone
              ? getConeTintGradientTexture(ratio, coneAngle)
              : getTintRadialGradientTexture(ratio);
            sprite.tint = 0xffffff;
            sprite.alpha = 1.0;
            sprite.blendMode = 'max';
          } else {
            sprite.texture = getDimRadialGradientTexture(ratio);
            sprite.blendMode = 'normal';
          }
          sprite.position.set(light.center.x, light.center.y);
          sprite.rotation = isCone ? totalAngleRad : 0;
          sprite.width = rTotal * 2;
          sprite.height = rTotal * 2;
          sprite.visible = true;
          darkSpriteIdx++;
        }
        for (let i = darkSpriteIdx; i < this.dimSprites.length; i++) {
          this.dimSprites[i].visible = false;
        }
      } else {
        for (const s of this.dimSprites) s.visible = false;
      }

      // 5. Regenerar máscara stencil única y sprites del haz continuo de luz (mismo sector, color uniforme)
      this.tintDimMaskGfx.clear();
      let tintSpriteIdx = 0;
      for (const light of lights) {
        if (light.totalPolygon && light.totalPolygon.length >= 3) {
          const rBright = light.brightRangePx || 0;
          const rTotal = light.totalRangePx || 0;
          if (rTotal > 0 && light.center) {
            this.tintDimMaskGfx.poly(light.totalPolygon.map((p) => [p.x, p.y]).flat());
            this.tintDimMaskGfx.fill({ color: 0xffffff, alpha: 1.0 });

            let sprite = this.tintDimSprites[tintSpriteIdx];
            if (!sprite) {
              sprite = new Sprite();
              sprite.anchor.set(0.5);
              this.tintDimSprites.push(sprite);
              this.tintDimSpritesContainer.addChild(sprite);
            }
            sprite.blendMode = 'screen';
            const ratio = rTotal > 0 ? rBright / rTotal : 1.0;
            const isCone = light.shape === 'cone';
            const coneAngle = light.coneAngle ?? 60;
            const totalAngleRad = (light.rotation || 0) + ((light.directionOffset || 0) * Math.PI) / 180;

            sprite.texture = isCone
              ? getConeTintGradientTexture(ratio, coneAngle)
              : getTintRadialGradientTexture(ratio);
            sprite.position.set(light.center.x, light.center.y);
            sprite.rotation = isCone ? totalAngleRad : 0;
            sprite.width = rTotal * 2;
            sprite.height = rTotal * 2;
            sprite.visible = true;
            tintSpriteIdx++;
          }
        }
      }
      for (let i = tintSpriteIdx; i < this.tintDimSprites.length; i++) {
        this.tintDimSprites[i].visible = false;
      }
    }

    // 6. Animación ligera por fotograma: ÚNICAMENTE actualizar alfas, tintes y parpadeo (sin tocar geometría ni máscaras)
    const darkColorHex = rgbToHex(this.currentR * 0.15, this.currentG * 0.15, this.currentB * 0.25);
    const darknessAlpha = currentDarkness * 0.95;

    if (currentDarkness > 0.01) {
      this.darknessGfx.visible = true;
      this.darknessGfx.tint = darkColorHex;
      this.darknessGfx.alpha = darknessAlpha;

      this.dimContainer.visible = true;
      if (this.darknessFilter) {
        this.darknessFilter.setDarknessColor(
          (this.currentR * 0.15) / 255,
          (this.currentG * 0.15) / 255,
          (this.currentB * 0.25) / 255
        );
        this.darknessFilter.setDarknessAlpha(darknessAlpha);
      } else {
        for (const sprite of this.dimSprites) {
          if (sprite.visible) {
            sprite.tint = darkColorHex;
            sprite.alpha = darknessAlpha;
          }
        }
      }
    } else {
      this.darknessGfx.visible = false;
      this.dimContainer.visible = false;
    }

    // Modular tinte de luces según oscuridad ambiental, parpadeo de antorchas y fundido de 0.6s
    const darknessFactor = 0.05 + 0.95 * Math.pow(Math.min(1.0, currentDarkness / 0.85), 1.5);

    let activeTintIdx = 0;
    let activeDimIdx = 0;
    for (const light of lights) {
      let fadeFactor = 1.0;
      if (!this.isMaster) {
        const target = light.visibleToPlayers !== false ? 1.0 : 0.0;
        let fade = this.lightFadeMap.get(light.lightId);
        if (!fade) {
          fade = { current: target, target };
          this.lightFadeMap.set(light.lightId, fade);
        }
        fade.target = target;
        const diff = fade.target - fade.current;
        if (diff !== 0) {
          const step = deltaSeconds / 0.6;
          fade.current = Math.abs(diff) <= step ? fade.target : fade.current + Math.sign(diff) * step;
        }
        fadeFactor = fade.current;
      }

      // Actualizar alfa del sprite de reducción de oscuridad
      const rBright = light.brightRangePx || 0;
      const rTotal = light.totalRangePx || 0;
      if (rTotal > 0 && light.center) {
        const dimSprite = this.dimSprites[activeDimIdx++];
        if (dimSprite) {
          dimSprite.alpha = fadeFactor;
          dimSprite.visible = fadeFactor > 0.001;
        }
      }

      // Actualizar alfa del sprite del haz de luz
      const { rgb: colorNum } = parseColor(light.color, 0xffaa44);

      let flickerMod = 1.0;
      if (light.flicker) {
        const seed = Math.sin(Number(light.lightId.slice(-3)) || 1);
        flickerMod = 0.90 + 0.10 * Math.sin(this.timeSec * 8 + seed) * Math.cos(this.timeSec * 13 + seed);
      }

      const baseAlpha = light.intensity * 0.25 * darknessFactor * flickerMod;
      if (rTotal > 0 && light.center && light.totalPolygon && light.totalPolygon.length >= 3) {
        const sprite = this.tintDimSprites[activeTintIdx++];
        if (sprite) {
          sprite.tint = colorNum;
          sprite.alpha = baseAlpha * fadeFactor;
          sprite.visible = sprite.alpha > 0.001;
        }
      }
    }
  }
}
