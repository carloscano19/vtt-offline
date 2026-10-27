import { Container, Graphics, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import { Entity, EffectConfig, EffectPresetId, Point2D } from '../../types/entity';
import { CameraState } from '../../types/game';
import { getTextureForAsset, getGifDataForAsset } from '../utils/textureCache';
import { videoManager } from '../../modules/media/videoManager';
import { AnimatedGifData, getFrameTextureForTime } from '../../modules/media/gifDecoder';
import { parseColor } from '../../utils/color';

interface EffectParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  color: number;
}

class ProceduralEffectNode extends Container {
  public entityId: string;
  public baseGfx: Graphics;
  public particleGfx: Graphics;
  public sprite: Sprite | null = null;
  private loadedAssetId: string | null = null;
  private loadedCkKey: string | null = null;
  private gifData: AnimatedGifData | null = null;
  private particles: EffectParticle[] = [];
  private time = 0;
  private lightningTimer = 0;
  private lightningBolts: Point2D[][] = [];

  constructor(entityId: string) {
    super();
    this.entityId = entityId;
    this.baseGfx = new Graphics();
    this.particleGfx = new Graphics();
    this.addChild(this.baseGfx);
    this.addChild(this.particleGfx);
  }

  public update(entity: Entity, deltaSec: number, isVisible: boolean, isMaster: boolean) {
    this.x = entity.x;
    this.y = entity.y;
    this.rotation = entity.rotation;
    this.scale.set(entity.scaleX, entity.scaleY);
    this.zIndex = entity.zIndex ?? 25;

    // Opacidad para máster vs jugadores
    if (isMaster) {
      this.alpha = entity.visibleToPlayers ? 1.0 : 0.45;
    } else {
      this.alpha = 1.0;
    }

    if (!isVisible) {
      this.visible = false;
      return;
    }
    this.visible = true;

    // 1. Si el efecto tiene un asset multimedia propio (GIF, vídeo MP4/WebM o imagen PNG)
    if (entity.assetId) {
      this.baseGfx.visible = false;
      this.particleGfx.visible = false;

      if (!this.sprite) {
        this.sprite = new Sprite(Texture.EMPTY);
        this.sprite.label = 'effect-sprite';
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);
      }
      this.sprite.visible = true;

      const ck = entity.chromaKey;
      const currentCkKey = ck && ck.enabled ? `ck_${ck.color}_${ck.tolerance}` : 'no_ck';
      if (
        this.loadedAssetId !== entity.assetId ||
        this.loadedCkKey !== currentCkKey ||
        this.sprite.texture === Texture.EMPTY
      ) {
        this.loadedAssetId = entity.assetId;
        this.loadedCkKey = currentCkKey;

        getGifDataForAsset(entity.assetId, ck).then((gd) => {
          if (gd && !this.destroyed) {
            this.gifData = gd;
          }
        });

        videoManager.registerActiveEntityVideo(entity.id);

        getTextureForAsset(entity.assetId, ck).then((tex) => {
          if (tex && this.sprite && !this.destroyed) {
            this.sprite.texture = tex;
          }
        });
      }

      // Animación continua de frames de GIF
      if (this.gifData && this.sprite) {
        const frame = getFrameTextureForTime(this.gifData, Date.now());
        if (frame && frame !== this.sprite.texture) {
          this.sprite.texture = frame;
        }
      }

      // Filtros visuales (Tono, saturación y brillo)
      if (entity.filters && this.sprite) {
        const { hue = 0, saturation = 1, brightness = 1 } = entity.filters;
        if (hue !== 0 || saturation !== 1 || brightness !== 1) {
          let cmf = (this.sprite as any)._cmf as ColorMatrixFilter;
          if (!cmf) {
            cmf = new ColorMatrixFilter();
            (this.sprite as any)._cmf = cmf;
          }
          cmf.reset();
          if (hue !== 0) cmf.hue(hue, false);
          if (saturation !== 1) cmf.saturate(saturation, false);
          if (brightness !== 1) cmf.brightness(brightness, false);
          this.sprite.filters = [cmf];
        } else {
          this.sprite.filters = null;
        }
      } else if (this.sprite) {
        this.sprite.filters = null;
      }

      return;
    }

    // 2. Efecto procedural (gráficos y partículas PixiJS)
    if (this.sprite) {
      this.sprite.visible = false;
    }
    this.baseGfx.visible = true;
    this.particleGfx.visible = true;

    const effect = entity.effect;
    if (!effect) return;

    const speed = Math.max(0.1, Math.min(3.0, effect.speed ?? 1.0));
    const effectiveDelta = deltaSec * speed;
    this.time += effectiveDelta;

    const hexColor = parseColor(effect.color, 0xff7700).rgb;
    const intensity = Math.max(0, Math.min(100, effect.intensity ?? 80)) / 100;

    this.renderEffect(effect.preset, hexColor, intensity, effectiveDelta);
  }

  private initParticlePool(maxCount: number) {
    while (this.particles.length < maxCount) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        alpha: 0,
        color: 0xffffff
      });
    }
    if (this.particles.length > maxCount) {
      this.particles.length = maxCount;
    }
  }

  private renderEffect(preset: EffectPresetId, color: number, intensity: number, dt: number) {
    this.baseGfx.clear();
    this.particleGfx.clear();

    switch (preset) {
      case 'torch':
        this.renderTorch(color, intensity, dt);
        break;
      case 'campfire':
        this.renderCampfire(color, intensity, dt);
        break;
      case 'brazier':
        this.renderBrazier(color, intensity, dt);
        break;
      case 'lantern':
        this.renderLantern(color, intensity, dt);
        break;
      case 'candle':
        this.renderCandle(color, intensity, dt);
        break;
      case 'fire_small':
        this.renderFireSmall(color, intensity, dt);
        break;
      case 'fire_large':
        this.renderFireLarge(color, intensity, dt);
        break;
      case 'fire_magic':
        this.renderFireMagic(color, intensity, dt);
        break;
      case 'smoke_light':
        this.renderSmokeLight(color, intensity, dt);
        break;
      case 'smoke_dense':
        this.renderSmokeDense(color, intensity, dt);
        break;
      case 'fog_low':
        this.renderFogLow(color, intensity, dt);
        break;
      case 'magic_seal':
        this.renderMagicSeal(color, intensity, dt);
        break;
      case 'portal':
        this.renderPortal(color, intensity, dt);
        break;
      case 'lightning':
        this.renderLightning(color, intensity, dt);
        break;
      case 'ice_zone':
        this.renderIceZone(color, intensity, dt);
        break;
      default:
        this.renderFireSmall(color, intensity, dt);
        break;
    }
  }

  // 1. Antorcha de pared
  private renderTorch(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    // Soporte de pared metálico/madera
    bg.rect(-3, 2, 6, 16);
    bg.fill({ color: 0x4a2e18 });
    bg.rect(-5, 0, 10, 4);
    bg.fill({ color: 0x1e293b });

    // Llama oscilante
    const flicker = Math.sin(this.time * 14) * 1.5 + Math.cos(this.time * 23) * 1.0;
    const flameH = (12 + flicker) * intensity;
    bg.circle(0, -flameH * 0.4, 5 * intensity);
    bg.fill({ color: color, alpha: 0.85 });
    bg.circle(0, -flameH * 0.5, 2.5 * intensity);
    bg.fill({ color: 0xffffff, alpha: 0.95 });

    // Chispas ascendentes (pool de 8)
    this.initParticlePool(8);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.4 + Math.random() * 0.6;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 6;
        p.y = -4;
        p.vx = (Math.random() - 0.5) * 14;
        p.vy = -(25 + Math.random() * 25);
        p.size = 1 + Math.random() * 1.5;
        p.alpha = 0.9;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color: 0xffdd44, alpha: progress * intensity });
    }
  }

  // 2. Hoguera
  private renderCampfire(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    // Piedras circulares
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      bg.circle(Math.cos(a) * 16, Math.sin(a) * 12 + 6, 4.5);
      bg.fill({ color: 0x475569 });
    }
    // Troncos cruzados
    bg.rect(-16, 2, 32, 5);
    bg.fill({ color: 0x3d2817 });
    bg.rect(-5, -6, 10, 22);
    bg.fill({ color: 0x451a03 });

    // Masa de fuego
    const wave = Math.sin(this.time * 12) * 2;
    bg.circle(wave * 0.5, -4, 11 * intensity);
    bg.fill({ color: color, alpha: 0.75 });
    bg.circle(-wave * 0.5, -7, 6 * intensity);
    bg.fill({ color: 0xffea00, alpha: 0.9 });
    bg.circle(0, -9, 3 * intensity);
    bg.fill({ color: 0xffffff, alpha: 1.0 });

    // Chispas y brasas (pool de 18)
    this.initParticlePool(18);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.6 + Math.random() * 0.8;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 16;
        p.y = 0;
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = -(35 + Math.random() * 45);
        p.size = 1.2 + Math.random() * 2;
      }
      p.x += p.vx * dt + Math.sin(this.time * 5 + p.y * 0.05) * 0.5;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color: 0xffa020, alpha: progress * intensity });
    }
  }

  // 3. Brasero
  private renderBrazier(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    // Patas de hierro
    bg.moveTo(-16, 18);
    bg.lineTo(-10, 4);
    bg.lineTo(0, 16);
    bg.lineTo(10, 4);
    bg.lineTo(16, 18);
    bg.stroke({ width: 3, color: 0x1e293b });

    // Cuenco de hierro
    bg.circle(0, 2, 14);
    bg.fill({ color: 0x0f172a });
    bg.stroke({ width: 2, color: 0x334155 });

    // Carbón incandescente
    bg.circle(0, 0, 9);
    bg.fill({ color: 0xb91c1c });

    // Llamas
    const flicker = Math.sin(this.time * 16) * 2;
    bg.circle(flicker * 0.4, -6, 8 * intensity);
    bg.fill({ color: color, alpha: 0.85 });
    bg.circle(0, -9, 4 * intensity);
    bg.fill({ color: 0xffea00, alpha: 0.95 });

    // Chispas
    this.initParticlePool(12);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.5 + Math.random() * 0.7;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 12;
        p.y = 0;
        p.vx = (Math.random() - 0.5) * 16;
        p.vy = -(30 + Math.random() * 30);
        p.size = 1.2 + Math.random() * 1.5;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color: 0xffdd44, alpha: progress * intensity });
    }
  }

  // 4. Farol
  private renderLantern(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    // Jaula metálica
    bg.rect(-10, -10, 20, 22);
    bg.fill({ color: 0x020617, alpha: 0.5 });
    bg.stroke({ width: 2, color: 0xd97706 });
    // Tapa y asa
    bg.rect(-12, -14, 24, 5);
    bg.fill({ color: 0x92400e });
    bg.circle(0, -17, 4);
    bg.stroke({ width: 1.5, color: 0xd97706 });

    // Luz cálida interior
    const pulse = 1 + Math.sin(this.time * 10) * 0.08;
    bg.circle(0, 0, 7 * pulse * intensity);
    bg.fill({ color: color, alpha: 0.75 });
    bg.circle(0, 0, 3 * intensity);
    bg.fill({ color: 0xffffff, alpha: 0.95 });
  }

  // 5. Vela
  private renderCandle(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    // Cuerpo de cera con cera derretida
    bg.rect(-4, -2, 8, 16);
    bg.fill({ color: 0xfef08a });
    bg.circle(-2, 14, 3);
    bg.fill({ color: 0xfef08a });
    // Mecha
    bg.rect(-0.75, -6, 1.5, 5);
    bg.fill({ color: 0x1f2937 });

    // Pequeña llama en gota
    const f = Math.sin(this.time * 18) * 0.8;
    bg.circle(f * 0.5, -9, 3.5 * intensity);
    bg.fill({ color: color, alpha: 0.85 });
    bg.circle(f * 0.3, -9.5, 1.5 * intensity);
    bg.fill({ color: 0xffffff, alpha: 1 });
  }

  // 6. Fuego - Llamas pequeñas
  private renderFireSmall(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    const wave = Math.sin(this.time * 14) * 3;
    bg.circle(wave * 0.4, 0, 10 * intensity);
    bg.fill({ color: color, alpha: 0.75 });
    bg.circle(-wave * 0.5, -4, 6 * intensity);
    bg.fill({ color: 0xfbbf24, alpha: 0.85 });

    this.initParticlePool(14);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.4 + Math.random() * 0.6;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 16;
        p.y = 4;
        p.vx = (Math.random() - 0.5) * 18;
        p.vy = -(25 + Math.random() * 35);
        p.size = 1.5 + Math.random() * 2;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color, alpha: progress * intensity });
    }
  }

  // 7. Fuego - Incendio grande
  private renderFireLarge(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    for (let i = 0; i < 4; i++) {
      const ph = this.time * 12 + i * 1.5;
      const ox = Math.sin(ph) * (8 + i * 3);
      const oy = -i * 5 - Math.abs(Math.cos(ph)) * 6;
      bg.circle(ox, oy, (18 - i * 3) * intensity);
      bg.fill({ color, alpha: 0.45 + i * 0.1 });
    }
    bg.circle(0, -6, 10 * intensity);
    bg.fill({ color: 0xffedd5, alpha: 0.9 });

    this.initParticlePool(32);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.5 + Math.random() * 0.9;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 36;
        p.y = 8;
        p.vx = (Math.random() - 0.5) * 28;
        p.vy = -(45 + Math.random() * 60);
        p.size = 2 + Math.random() * 3.5;
      }
      p.x += p.vx * dt + Math.sin(this.time * 6 + p.y * 0.04) * 1.2;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color: progress > 0.4 ? color : 0x475569, alpha: progress * intensity });
    }
  }

  // 8. Fuego Mágico
  private renderFireMagic(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    const pulse = 1 + Math.sin(this.time * 8) * 0.15;
    bg.circle(0, -4, 14 * pulse * intensity);
    bg.fill({ color, alpha: 0.5 });
    bg.circle(0, -6, 7 * intensity);
    bg.fill({ color: 0xffffff, alpha: 0.85 });

    this.initParticlePool(24);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.6 + Math.random() * 0.8;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 24;
        p.y = 2;
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = -(30 + Math.random() * 40);
        p.size = 2 + Math.random() * 2.5;
      }
      p.x += p.vx * dt + Math.cos(this.time * 7 + p.y * 0.05) * 1.0;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * progress);
      this.particleGfx.fill({ color, alpha: progress * 0.9 * intensity });
    }
  }

  // 9. Humo ligero
  private renderSmokeLight(color: number, intensity: number, dt: number) {
    this.initParticlePool(16);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 1.0 + Math.random() * 1.2;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 10;
        p.y = 4;
        p.vx = (Math.random() - 0.5) * 12;
        p.vy = -(15 + Math.random() * 20);
        p.size = 4 + Math.random() * 4;
      }
      p.x += p.vx * dt + Math.sin(this.time * 3 + p.y * 0.03) * 0.8;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      const growSize = p.size + (1 - progress) * 16;
      this.particleGfx.circle(p.x, p.y, growSize);
      this.particleGfx.fill({ color: 0x94a3b8, alpha: progress * 0.25 * intensity });
    }
  }

  // 10. Humareda densa
  private renderSmokeDense(color: number, intensity: number, dt: number) {
    this.initParticlePool(26);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 1.2 + Math.random() * 1.5;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 20;
        p.y = 8;
        p.vx = (Math.random() - 0.5) * 18;
        p.vy = -(20 + Math.random() * 25);
        p.size = 8 + Math.random() * 8;
      }
      p.x += p.vx * dt + Math.sin(this.time * 2.5 + p.y * 0.02) * 1.2;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      const growSize = p.size + (1 - progress) * 26;
      this.particleGfx.circle(p.x, p.y, growSize);
      this.particleGfx.fill({ color: 0x1e293b, alpha: progress * 0.55 * intensity });
    }
  }

  // 11. Niebla baja
  private renderFogLow(color: number, intensity: number, dt: number) {
    this.initParticlePool(20);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 1.5 + Math.random() * 2.0;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 50;
        p.y = (Math.random() - 0.5) * 14;
        p.vx = (Math.random() - 0.5) * 15;
        p.vy = (Math.random() - 0.5) * 4;
        p.size = 14 + Math.random() * 12;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size);
      this.particleGfx.fill({ color: 0xcfd8dc, alpha: Math.sin(progress * Math.PI) * 0.22 * intensity });
    }
  }

  // 12. Sello mágico
  private renderMagicSeal(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    const rOuter = 32;
    const pulse = 1 + Math.sin(this.time * 4) * 0.05;

    // Círculo exterior con resplandor
    bg.circle(0, 0, rOuter * pulse);
    bg.stroke({ width: 2, color, alpha: 0.8 * intensity });
    bg.circle(0, 0, (rOuter - 5) * pulse);
    bg.stroke({ width: 1, color, alpha: 0.5 * intensity });

    // Anillo rúnico que gira
    const rot1 = this.time * 0.6;
    for (let i = 0; i < 8; i++) {
      const a = rot1 + (i / 8) * Math.PI * 2;
      const px = Math.cos(a) * (rOuter - 2.5);
      const py = Math.sin(a) * (rOuter - 2.5);
      bg.circle(px, py, 1.5);
      bg.fill({ color, alpha: 0.9 * intensity });
    }

    // Estrella o polígono interior girando en contrasentido
    const rot2 = -this.time * 0.4;
    const points: Point2D[] = [];
    for (let i = 0; i < 6; i++) {
      const a = rot2 + (i / 6) * Math.PI * 2;
      const rad = i % 2 === 0 ? 18 : 9;
      points.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    if (points.length > 0) {
      bg.poly(points, true);
      bg.stroke({ width: 1.5, color, alpha: 0.75 * intensity });
    }

    // Núcleo brillante
    bg.circle(0, 0, 5 * pulse);
    bg.fill({ color, alpha: 0.6 * intensity });
  }

  // 13. Portal
  private renderPortal(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;
    const rot = this.time * 2.5;

    // Anillos espirales
    for (let ring = 0; ring < 3; ring++) {
      const ringRot = rot * (ring % 2 === 0 ? 1 : -0.7) + ring;
      const r = 14 + ring * 8;
      bg.ellipse(0, 0, r, r * 0.6);
      bg.stroke({ width: 2, color, alpha: (0.4 + ring * 0.2) * intensity });
    }

    // Brazos vórtice
    for (let i = 0; i < 4; i++) {
      const a = rot + (i / 4) * Math.PI * 2;
      bg.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      bg.lineTo(Math.cos(a + 0.8) * 30, Math.sin(a + 0.8) * 22);
      bg.stroke({ width: 2.5, color, alpha: 0.8 * intensity });
    }

    // Núcleo singular
    bg.circle(0, 0, 6);
    bg.fill({ color: 0xffffff, alpha: 0.95 * intensity });

    // Partículas absorbidas hacia el centro
    this.initParticlePool(14);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.5 + Math.random() * 0.5;
        p.maxLife = p.life;
        const ang = Math.random() * Math.PI * 2;
        const dist = 28 + Math.random() * 12;
        p.x = Math.cos(ang) * dist;
        p.y = Math.sin(ang) * dist * 0.7;
      }
      // Movimiento espiral centrípeto
      const curDist = Math.hypot(p.x, p.y);
      if (curDist > 2) {
        const ang = Math.atan2(p.y, p.x) + dt * 4;
        const nextDist = Math.max(1, curDist - dt * 45);
        p.x = Math.cos(ang) * nextDist;
        p.y = Math.sin(ang) * nextDist * 0.7;
      }
      this.particleGfx.circle(p.x, p.y, 1.8);
      this.particleGfx.fill({ color, alpha: 0.85 * intensity });
    }
  }

  // 14. Rayos
  private renderLightning(color: number, intensity: number, dt: number) {
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 0.15 + Math.random() * 0.45;
      this.lightningBolts = [];

      // Generar 1 o 2 arcos fractales
      const numBolts = 1 + Math.floor(Math.random() * 2);
      for (let b = 0; b < numBolts; b++) {
        const bolt: Point2D[] = [];
        let curX = (Math.random() - 0.5) * 8;
        let curY = -28;
        bolt.push({ x: curX, y: curY });
        while (curY < 24) {
          curX += (Math.random() - 0.5) * 14;
          curY += 6 + Math.random() * 8;
          bolt.push({ x: curX, y: Math.min(24, curY) });
        }
        this.lightningBolts.push(bolt);
      }
    }

    const bg = this.baseGfx;
    if (this.lightningBolts.length > 0) {
      for (const bolt of this.lightningBolts) {
        for (let i = 0; i < bolt.length - 1; i++) {
          bg.moveTo(bolt[i].x, bolt[i].y);
          bg.lineTo(bolt[i + 1].x, bolt[i + 1].y);
          bg.stroke({ width: 3, color, alpha: 0.7 * intensity });
          bg.moveTo(bolt[i].x, bolt[i].y);
          bg.lineTo(bolt[i + 1].x, bolt[i + 1].y);
          bg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.95 * intensity });
        }
      }
    }

    // Chispas residuales en el punto de impacto
    this.initParticlePool(10);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.2 + Math.random() * 0.3;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 16;
        p.y = 20 + (Math.random() - 0.5) * 6;
        p.vx = (Math.random() - 0.5) * 35;
        p.vy = -(15 + Math.random() * 30);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, 1.2);
      this.particleGfx.fill({ color: 0xffffff, alpha: progress * intensity });
    }
  }

  // 15. Zona de Hielo / Escarcha
  private renderIceZone(color: number, intensity: number, dt: number) {
    const bg = this.baseGfx;

    // Cristales de escarcha puntiagudos
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      const len = 16 + (i % 2 === 0 ? 8 : 2);
      bg.moveTo(0, 0);
      bg.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      bg.stroke({ width: 2, color: 0xa5f3fc, alpha: 0.7 * intensity });
      // Puntas de cristal secundarias
      const mx = Math.cos(a) * (len * 0.6);
      const my = Math.sin(a) * (len * 0.6);
      const na = a + 0.6;
      bg.moveTo(mx, my);
      bg.lineTo(mx + Math.cos(na) * 6, my + Math.sin(na) * 6);
      bg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 * intensity });
    }

    // Centro helado
    bg.circle(0, 0, 7);
    bg.fill({ color: 0x38bdf8, alpha: 0.4 * intensity });
    bg.circle(0, 0, 3);
    bg.fill({ color: 0xffffff, alpha: 0.8 * intensity });

    // Vaho frío flotando lentamente hacia arriba
    this.initParticlePool(14);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0.8 + Math.random() * 1.0;
        p.maxLife = p.life;
        p.x = (Math.random() - 0.5) * 32;
        p.y = 8;
        p.vx = (Math.random() - 0.5) * 8;
        p.vy = -(8 + Math.random() * 12);
        p.size = 2.5 + Math.random() * 3;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const progress = p.life / p.maxLife;
      this.particleGfx.circle(p.x, p.y, p.size * (1 + (1 - progress)));
      this.particleGfx.fill({ color: 0xe0f2fe, alpha: progress * 0.25 * intensity });
    }
  }
}

export class EffectsLayer extends Container {
  private isMaster: boolean;
  private effectNodes: Map<string, ProceduralEffectNode> = new Map();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public update(
    entities: Entity[],
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
    deltaSeconds: number = 0.016
  ) {
    const effectEntities = entities.filter(
      (e) => e.type === 'effect' && (this.isMaster || e.visibleToPlayers !== false)
    );

    const currentIds = new Set<string>();

    // Límites de culling en coordenadas del mundo
    const sw = screenWidth > 0 ? screenWidth : 1920;
    const sh = screenHeight > 0 ? screenHeight : 1080;
    const zoom = Math.max(0.05, camera.zoom || 1);
    const halfWorldW = sw / zoom / 2;
    const halfWorldH = sh / zoom / 2;
    const minWorldX = camera.x - halfWorldW - 120;
    const maxWorldX = camera.x + halfWorldW + 120;
    const minWorldY = camera.y - halfWorldH - 120;
    const maxWorldY = camera.y + halfWorldH + 120;

    for (const ent of effectEntities) {
      currentIds.add(ent.id);
      let node = this.effectNodes.get(ent.id);
      if (!node) {
        node = new ProceduralEffectNode(ent.id);
        this.effectNodes.set(ent.id, node);
        this.addChild(node);
      }

      // Comprobar si está en el viewport visible para pausar si está fuera
      const isVisibleInView =
        ent.x >= minWorldX &&
        ent.x <= maxWorldX &&
        ent.y >= minWorldY &&
        ent.y <= maxWorldY;

      node.update(ent, deltaSeconds, isVisibleInView, this.isMaster);
    }

    // Limpiar efectos eliminados
    for (const [id, node] of this.effectNodes.entries()) {
      if (!currentIds.has(id)) {
        videoManager.unregisterActiveEntityVideo(id);
        this.removeChild(node);
        node.destroy({ children: true });
        this.effectNodes.delete(id);
      }
    }
  }

  public getEntityBounds(entityId: string): { width: number; height: number } | null {
    const node = this.effectNodes.get(entityId);
    if (!node) return null;
    if (node.sprite && node.sprite.texture && node.sprite.texture !== Texture.EMPTY) {
      return {
        width: Math.max(20, node.sprite.texture.width),
        height: Math.max(20, node.sprite.texture.height)
      };
    }
    return { width: 70, height: 70 };
  }
}
