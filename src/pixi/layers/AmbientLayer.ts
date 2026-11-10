import { Container, Graphics, Sprite } from 'pixi.js';
import { AmbientConfig, ExploredMultiPolygon } from '../../types/game';
import { LightVisibility } from '../../modules/lights/lightManager';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';
import { visionToMulti, simplifyMulti } from '../../modules/vision/fogMemory';
import { safeClip } from '../../modules/vision/safeClip';
import { parseColor, rgbComponents } from '../../utils/color';
import { getDimRadialGradientTexture, getTintRadialGradientTexture, getConeTintGradientTexture } from '../utils/gradientTextures';
import { DarknessInvertFilter } from '../filters/DarknessInvertFilter';

export const AMBIENT_PRESET_CONFIGS: Record<string, { color: string; intensity: number }> = {
  dawn: { color: '#ff9d55', intensity: 20 },
  noon: { color: '#ffffff', intensity: 0 },
  dusk: { color: '#c84224', intensity: 60 },
  night: { color: '#091124', intensity: 85 },
  custom: { color: '#c84224', intensity: 60 }
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

  // Contenedor para degradado radial suave de oscuridad en zona iluminada (máscara por sprite)
  private dimContainer = new Container();
  private dimSpritesContainer = new Container();
  private dimGroups: Container[] = [];
  private dimSprites: Sprite[] = [];
  private dimMasks: Graphics[] = [];
  private darknessFilter: DarknessInvertFilter | null = null;

  // Contenedor para haz continuo de luz con degradado suave (máscara por sprite)
  private tintDimContainer = new Container();
  private tintDimSpritesContainer = new Container();
  private tintDimGroups: Container[] = [];
  private tintDimSprites: Sprite[] = [];
  private tintDimMasks: Graphics[] = [];

  // Estado para la transición suave
  private currentR = 200;
  private currentG = 66;
  private currentB = 36;
  private currentDarkness = 0.60;

  private targetR = 200;
  private targetG = 66;
  private targetB = 36;
  private targetDarkness = 0.60;

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
    // Cada sprite dentro de dimSpritesContainer tiene su propia máscara recortada a su polígono
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
    // Cada sprite dentro de tintDimSpritesContainer tiene su propia máscara recortada a su polígono
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
    deltaSeconds: number = 0.016,
    visibilities: TokenVisibility[] = []
  ) {
    this.timeSec += deltaSeconds;

    // Tokens de jugador con visión activa que iluminan su entorno
    const illuminatingTokens = (visibilities || []).filter(
      (t) =>
        t.illuminates !== false &&
        t.totalRangePx > 0 &&
        t.center &&
        t.totalPolygon &&
        t.totalPolygon.length >= 3
    );

    // 1. Determinar valores objetivo según preset o personalizado
    const preset = ambientConfig?.preset || 'dusk';
    const presetData = AMBIENT_PRESET_CONFIGS[preset] || AMBIENT_PRESET_CONFIGS.dusk;
    const targetColorStr = ambientConfig?.color || presetData.color;
    const rawIntensity = preset === 'custom'
      ? (typeof ambientConfig?.intensity === 'number' ? ambientConfig.intensity : presetData.intensity)
      : presetData.intensity;
    // Si intensity viniera en formato legacy <= 1.0 (ej. 0.35 o 0.85):
    const targetDarkness = (rawIntensity > 1.0 ? rawIntensity : rawIntensity * 100) / 100;

    const targetRgb = hexToRgb(targetColorStr);
    this.targetR = targetRgb.r;
    this.targetG = targetRgb.g;
    this.targetB = targetRgb.b;
    this.targetDarkness = Math.max(0, Math.min(1.0, targetDarkness));

    // 2. Interpolar suavemente (2s para presets, 0.2s para ajustes manuales en custom)
    const transitionDuration = preset === 'custom' ? 0.2 : 2.0;
    const factor = Math.min(1.0, deltaSeconds / transitionDuration);
    this.currentR += (this.targetR - this.currentR) * factor;
    this.currentG += (this.targetG - this.currentG) * factor;
    this.currentB += (this.targetB - this.currentB) * factor;
    this.currentDarkness += (this.targetDarkness - this.currentDarkness) * factor;

    // 3. Clave para invalidar cálculo de polígonos (solo si cambian luces, tokens con visión o bounds)
    const bx = Number.isFinite(bounds.x) ? Math.round(bounds.x) : -2000;
    const by = Number.isFinite(bounds.y) ? Math.round(bounds.y) : -2000;
    const bw = Number.isFinite(bounds.width) && bounds.width > 0 ? Math.round(bounds.width) : 4000;
    const bh = Number.isFinite(bounds.height) && bounds.height > 0 ? Math.round(bounds.height) : 4000;

    const lightsKey = lights
      .map(
        (l) => {
          const polyHash = l.totalPolygon ? l.totalPolygon.reduce((acc, p) => (acc + Math.round(p.x * 31 + p.y * 17)) | 0, 0) : 0;
          return `${l.lightId}:${Math.round(l.center.x)}:${Math.round(l.center.y)}:${l.brightRangePx}:${l.totalRangePx}:${l.shape || 'circle'}:${l.coneAngle || 60}:${l.directionOffset || 0}:${Math.round((l.rotation || 0) * 100) / 100}:${l.totalPolygon?.length || 0}:${polyHash}`;
        }
      )
      .join('|');
    const tokensKey = illuminatingTokens
      .map(
        (t) => {
          const polyHash = t.totalPolygon ? t.totalPolygon.reduce((acc, p) => (acc + Math.round(p.x * 31 + p.y * 17)) | 0, 0) : 0;
          return `${t.tokenId}:${Math.round(t.center.x)}:${Math.round(t.center.y)}:${t.brightRangePx}:${t.totalRangePx}:${t.shape || 'circle'}:${t.coneAngle || 60}:${t.directionOffset || 0}:${Math.round((t.rotation || 0) * 100) / 100}:${t.totalPolygon?.length || 0}:${polyHash}`;
        }
      )
      .join('|');
    const geoKey = `${bx},${by},${bw},${bh}__${lightsKey}__${tokensKey}`;

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

      const lightPolys = lights.map((l) => l.totalPolygon).filter((p) => p && p.length >= 3);
      const tokenPolys = illuminatingTokens.map((t) => t.totalPolygon).filter((p) => p && p.length >= 3);
      const totalPolys = [...lightPolys, ...tokenPolys];

      let totalMulti: ExploredMultiPolygon = [];
      let outsideMulti: ExploredMultiPolygon = worldBoxMulti;

      if (totalPolys.length > 0) {
        totalMulti = simplifyMulti(safeClip.union(visionToMulti(totalPolys)));
        outsideMulti = simplifyMulti(safeClip.difference(worldBoxMulti, totalMulti));
      }

      this.cachedRegions = { outsideMulti, totalMulti };

      // 4a. Regenerar geometría estática de oscuridad fuera de las luces y visión
      this.darknessGfx.clear();
      this.renderMulti(this.darknessGfx, outsideMulti, 0xffffff, 1.0);

      // 4b. Regenerar máscara stencil individual por sprite para degradado de oscuridad de cada luz y token
      if (totalMulti.length > 0) {
        let darkSpriteIdx = 0;

        // Sprites de reducción de oscuridad para las luces
        for (const light of lights) {
          const rBright = light.brightRangePx || 0;
          const rTotal = light.totalRangePx || 0;
          if (rTotal <= 0 || !light.center) continue;

          let group = this.dimGroups[darkSpriteIdx];
          let sprite = this.dimSprites[darkSpriteIdx];
          let mask = this.dimMasks[darkSpriteIdx];
          if (!group) {
            group = new Container();
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            mask = new Graphics();
            group.mask = mask;
            group.addChild(mask);
            group.addChild(sprite);
            this.dimGroups.push(group);
            this.dimSprites.push(sprite);
            this.dimMasks.push(mask);
            this.dimSpritesContainer.addChild(group);
          }

          mask.clear();
          if (light.totalPolygon && light.totalPolygon.length >= 3) {
            mask.poly(light.totalPolygon.map((p) => [p.x, p.y]).flat());
            mask.fill({ color: 0xffffff, alpha: 1.0 });
            (mask as any)._polygon = light.totalPolygon;
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
          group.visible = true;
          darkSpriteIdx++;
        }

        // Sprites de reducción de oscuridad para los tokens con visión activa que iluminan
        for (const token of illuminatingTokens) {
          const rBright = token.brightRangePx || 0;
          const rTotal = token.totalRangePx || 0;
          if (rTotal <= 0 || !token.center) continue;

          let group = this.dimGroups[darkSpriteIdx];
          let sprite = this.dimSprites[darkSpriteIdx];
          let mask = this.dimMasks[darkSpriteIdx];
          if (!group) {
            group = new Container();
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            mask = new Graphics();
            group.mask = mask;
            group.addChild(mask);
            group.addChild(sprite);
            this.dimGroups.push(group);
            this.dimSprites.push(sprite);
            this.dimMasks.push(mask);
            this.dimSpritesContainer.addChild(group);
          }

          mask.clear();
          if (token.totalPolygon && token.totalPolygon.length >= 3) {
            mask.poly(token.totalPolygon.map((p) => [p.x, p.y]).flat());
            mask.fill({ color: 0xffffff, alpha: 1.0 });
            (mask as any)._polygon = token.totalPolygon;
          }

          const ratio = rTotal > 0 ? rBright / rTotal : 1.0;
          const isCone = token.shape === 'cone';
          const coneAngle = token.coneAngle ?? 60;
          const totalAngleRad = (token.rotation || 0) + ((token.directionOffset || 0) * Math.PI) / 180;

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
          sprite.position.set(token.center.x, token.center.y);
          sprite.rotation = isCone ? totalAngleRad : 0;
          sprite.width = rTotal * 2;
          sprite.height = rTotal * 2;
          sprite.visible = true;
          group.visible = true;
          darkSpriteIdx++;
        }

        for (let i = darkSpriteIdx; i < this.dimGroups.length; i++) {
          this.dimGroups[i].visible = false;
        }
      } else {
        for (const g of this.dimGroups) g.visible = false;
      }

      // 5. Regenerar máscara stencil individual y sprites del haz continuo de tinte (únicamente fuentes de luz, no tokens)
      let tintSpriteIdx = 0;
      for (const light of lights) {
        if (light.totalPolygon && light.totalPolygon.length >= 3) {
          const rBright = light.brightRangePx || 0;
          const rTotal = light.totalRangePx || 0;
          if (rTotal > 0 && light.center) {
            let group = this.tintDimGroups[tintSpriteIdx];
            let sprite = this.tintDimSprites[tintSpriteIdx];
            let mask = this.tintDimMasks[tintSpriteIdx];
            if (!group) {
              group = new Container();
              sprite = new Sprite();
              sprite.anchor.set(0.5);
              mask = new Graphics();
              group.mask = mask;
              group.addChild(mask);
              group.addChild(sprite);
              this.tintDimGroups.push(group);
              this.tintDimSprites.push(sprite);
              this.tintDimMasks.push(mask);
              this.tintDimSpritesContainer.addChild(group);
            }

            mask.clear();
            mask.poly(light.totalPolygon.map((p) => [p.x, p.y]).flat());
            mask.fill({ color: 0xffffff, alpha: 1.0 });
            (mask as any)._polygon = light.totalPolygon;

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
            group.visible = true;
            tintSpriteIdx++;
          }
        }
      }
      for (let i = tintSpriteIdx; i < this.tintDimGroups.length; i++) {
        this.tintDimGroups[i].visible = false;
      }
    }

    // 6. Animación ligera por fotograma: alfas, tintes suaves y parpadeo (sin tocar geometría ni máscaras)
    const tintR = Math.round(this.currentR * 0.22);
    const tintG = Math.round(this.currentG * 0.22);
    const tintB = Math.round(this.currentB * 0.22);
    const darkColorHex = rgbToHex(tintR, tintG, tintB);
    const darknessAlpha = this.currentDarkness * 0.95;

    if (this.currentDarkness > 0.005) {
      this.darknessGfx.visible = true;
      this.darknessGfx.tint = darkColorHex;
      this.darknessGfx.alpha = darknessAlpha;

      this.dimContainer.visible = true;
      if (this.darknessFilter) {
        this.darknessFilter.setDarknessColor(
          tintR / 255,
          tintG / 255,
          tintB / 255
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

    // Modular tinte suave de luces según oscuridad ambiental, parpadeo y saturación cromática
    const darknessFactor = 0.05 + 0.95 * Math.pow(Math.min(1.0, this.currentDarkness / 0.85), 1.5);

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

      // Actualizar alfa del sprite de reducción de oscuridad de la luz
      const rBright = light.brightRangePx || 0;
      const rTotal = light.totalRangePx || 0;
      if (rTotal > 0 && light.center) {
        const dimSprite = this.dimSprites[activeDimIdx];
        const dimGroup = this.dimGroups[activeDimIdx];
        activeDimIdx++;
        if (dimSprite && dimGroup) {
          dimSprite.alpha = fadeFactor;
          dimSprite.visible = fadeFactor > 0.001;
          dimGroup.visible = dimSprite.visible;
        }
      }

      // Actualizar tinte suave del haz de luz
      const { rgb: colorNum } = parseColor(light.color, 0xff9a3c);
      const r = (colorNum >> 16) & 0xff;
      const g = (colorNum >> 8) & 0xff;
      const b = colorNum & 0xff;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const saturation = maxC > 0 ? chroma / maxC : 0;

      let flickerMod = 1.0;
      if (light.flicker) {
        const seed = Math.sin(Number(light.lightId.slice(-3)) || 1);
        flickerMod = 0.90 + 0.10 * Math.sin(this.timeSec * 8 + seed) * Math.cos(this.timeSec * 13 + seed);
      }

      // Si el color de la luz es blanco o neutro, el tinte es prácticamente invisible (~0) para no lavar el mapa.
      // Si tiene color (ej. naranja #ff9a3c), añade solo un tinte suave a baja intensidad (~0.05-0.08) en screen.
      const baseAlpha = saturation > 0.03
        ? light.intensity * 0.09 * saturation * darknessFactor * flickerMod
        : 0;

      if (rTotal > 0 && light.center && light.totalPolygon && light.totalPolygon.length >= 3) {
        const sprite = this.tintDimSprites[activeTintIdx];
        const group = this.tintDimGroups[activeTintIdx];
        activeTintIdx++;
        if (sprite && group) {
          sprite.tint = colorNum;
          sprite.alpha = baseAlpha * fadeFactor;
          sprite.visible = sprite.alpha > 0.001;
          group.visible = sprite.visible;
        }
      }
    }

    // Los sprites de reducción de oscuridad de los tokens de jugador se mantienen siempre a 1.0
    for (const token of illuminatingTokens) {
      const rTotal = token.totalRangePx || 0;
      if (rTotal > 0 && token.center) {
        const dimSprite = this.dimSprites[activeDimIdx];
        const dimGroup = this.dimGroups[activeDimIdx];
        activeDimIdx++;
        if (dimSprite && dimGroup) {
          dimSprite.alpha = 1.0;
          dimSprite.visible = true;
          dimGroup.visible = true;
        }
      }
    }
  }

  public get dimMaskGfx(): Graphics | undefined {
    return this.dimMasks[0];
  }

  public get tintDimMaskGfx(): Graphics | undefined {
    return this.tintDimMasks[0];
  }

  public getDimMask(index: number): Graphics | undefined {
    return this.dimMasks[index];
  }

  public getDimGroup(index: number): Container | undefined {
    return this.dimGroups[index];
  }

  public getTintDimMask(index: number): Graphics | undefined {
    return this.tintDimMasks[index];
  }
}
