import { Container, Graphics } from 'pixi.js';
import polygonClipping from 'polygon-clipping';
import { AmbientConfig, ExploredMultiPolygon } from '../../types/game';
import { LightVisibility } from '../../modules/lights/lightManager';
import { visionToMulti, simplifyMulti } from '../../modules/vision/fogMemory';
import { snapMulti } from '../../modules/vision/fogRegions';

export const AMBIENT_PRESET_CONFIGS: Record<string, { color: string; intensity: number }> = {
  dawn: { color: '#ff9d55', intensity: 0.80 },
  noon: { color: '#ffffff', intensity: 1.00 },
  dusk: { color: '#c84224', intensity: 0.65 },
  night: { color: '#091124', intensity: 0.15 },
  custom: { color: '#ffffff', intensity: 1.00 }
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = (num >> 8) & 0xf;
    const g = (num >> 4) & 0xf;
    const b = num & 0xf;
    return { r: (r << 4) | r, g: (g << 4) | g, b: (b << 4) | b };
  }
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  };
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

    this.addChild(this.darknessGfx);
    this.addChild(this.lightsTintGfx);
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

      try {
        if (brightPolys.length > 0) {
          brightMulti = simplifyMulti(snapMulti(polygonClipping.union(visionToMulti(brightPolys)) as ExploredMultiPolygon));
        }
        if (totalPolys.length > 0) {
          totalMulti = simplifyMulti(snapMulti(polygonClipping.union(visionToMulti(totalPolys)) as ExploredMultiPolygon));
        }

        if (totalMulti.length > 0 && brightMulti.length > 0) {
          dimMulti = simplifyMulti(snapMulti(polygonClipping.difference(totalMulti, brightMulti) as ExploredMultiPolygon));
        } else if (totalMulti.length > 0) {
          dimMulti = totalMulti;
        }

        if (totalMulti.length > 0) {
          outsideMulti = simplifyMulti(snapMulti(polygonClipping.difference(worldBoxMulti, totalMulti) as ExploredMultiPolygon));
        }
      } catch (e) {
        console.warn('[AmbientLayer] Error en álgebra booleana de ambiente:', e);
      }

      this.cachedRegions = { outsideMulti, dimMulti, brightMulti };
    }

    const { outsideMulti, dimMulti, brightMulti } = this.cachedRegions;

    // 4. Dibujar oscuridad ambiental reducida en luces
    this.darknessGfx.clear();
    const darkColorHex = rgbToHex(this.currentR * 0.15, this.currentG * 0.15, this.currentB * 0.25);

    if (currentDarkness > 0.01) {
      // Oscuridad completa fuera de las luces
      this.renderMulti(this.darknessGfx, outsideMulti, darkColorHex, currentDarkness * 0.95);

      // Oscuridad reducida a la mitad en la zona tenue de cada luz
      if (dimMulti.length > 0) {
        this.renderMulti(this.darknessGfx, dimMulti, darkColorHex, currentDarkness * 0.45);
      }

      // Zona clara de las luces: sin oscuridad (0% alpha)
    }

    // 5. Dibujar tinte de color de cada luz dinámica (con parpadeo visual suave en ticker)
    this.lightsTintGfx.clear();
    for (const light of lights) {
      const rgb = hexToRgb(light.color);
      const colorNum = rgbToHex(rgb.r, rgb.g, rgb.b);

      // Parpadeo suave si está activo
      let flickerMod = 1.0;
      if (light.flicker) {
        const seed = Math.sin(Number(light.lightId.slice(-3)) || 1);
        flickerMod = 0.90 + 0.10 * Math.sin(this.timeSec * 8 + seed) * Math.cos(this.timeSec * 13 + seed);
      }

      const lightAlpha = light.intensity * 0.25 * flickerMod;

      if (light.brightPolygon && light.brightPolygon.length >= 3) {
        this.lightsTintGfx.poly(light.brightPolygon.map((p) => [p.x, p.y]).flat());
        this.lightsTintGfx.fill({ color: colorNum, alpha: lightAlpha });
      }

      if (light.totalPolygon && light.totalPolygon.length >= 3) {
        this.lightsTintGfx.poly(light.totalPolygon.map((p) => [p.x, p.y]).flat());
        this.lightsTintGfx.fill({ color: colorNum, alpha: lightAlpha * 0.5 });
      }
    }
  }
}
