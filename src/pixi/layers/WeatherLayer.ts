import { Container, Graphics } from 'pixi.js';
import { WeatherConfig, CameraState } from '../../types/game';

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
  swayPhase: number;
}

/**
 * Capa de clima con efectos ligeros de lluvia, nieve y viento mediante partículas vectoriales.
 * Se dibujan en coordenadas de pantalla relativas a la cámara, garantizando 60 fps constantes.
 */
export class WeatherLayer extends Container {
  private gfx = new Graphics();

  private rainParticles: Particle[] = [];
  private snowParticles: Particle[] = [];
  private windParticles: Particle[] = [];

  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  private initOrResizePool(pool: Particle[], count: number, screenW: number, screenH: number) {
    while (pool.length < count) {
      pool.push({
        x: Math.random() * screenW,
        y: Math.random() * screenH,
        speed: 0.5 + Math.random() * 0.5,
        size: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.7,
        swayPhase: Math.random() * Math.PI * 2
      });
    }
    if (pool.length > count) {
      pool.length = count;
    }
  }

  public update(
    weather: WeatherConfig,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
    deltaSeconds: number = 0.016
  ) {
    const sw = screenWidth > 0 ? screenWidth : 1920;
    const sh = screenHeight > 0 ? screenHeight : 1080;

    const hasRain = weather?.rain?.enabled && weather.rain.intensity > 0;
    const hasSnow = weather?.snow?.enabled && weather.snow.intensity > 0;
    const hasWind = weather?.wind?.enabled && weather.wind.intensity > 0;

    if (!hasRain && !hasSnow && !hasWind) {
      this.gfx.clear();
      this.visible = false;
      return;
    }

    this.visible = true;
    this.time += deltaSeconds;

    // Al ser hijo directo de app.stage, las coordenadas (0,0) a (sw, sh)
    // representan el área visible completa del viewport real en máster y tele
    this.position.set(0, 0);
    this.scale.set(1, 1);

    this.gfx.clear();

    // 1. LLUVIA
    if (hasRain) {
      const intensity = Math.min(100, Math.max(1, weather.rain.intensity));
      const count = Math.round((intensity / 100) * 180);
      this.initOrResizePool(this.rainParticles, count, sw, sh);

      const rad = ((weather.rain.direction ?? 90) * Math.PI) / 180;
      const baseSpeed = 800 + intensity * 8; // px / seg
      const dx = Math.cos(rad) * baseSpeed * deltaSeconds;
      const dy = Math.sin(rad) * baseSpeed * deltaSeconds;
      const dropLen = 14 + intensity * 0.15;

      for (const p of this.rainParticles) {
        p.x += dx * p.speed;
        p.y += dy * p.speed;

        // Wrap around
        if (p.x < -50) p.x += sw + 100;
        else if (p.x > sw + 50) p.x -= sw + 100;
        if (p.y < -50) p.y += sh + 100;
        else if (p.y > sh + 50) p.y -= sh + 100;

        const endX = p.x + Math.cos(rad) * dropLen;
        const endY = p.y + Math.sin(rad) * dropLen;

        this.gfx.moveTo(p.x, p.y);
        this.gfx.lineTo(endX, endY);
        this.gfx.stroke({ width: 1.5, color: 0xa5b4fc, alpha: p.alpha * 0.65 });
      }
    } else {
      this.rainParticles = [];
    }

    // 2. NIEVE
    if (hasSnow) {
      const intensity = Math.min(100, Math.max(1, weather.snow.intensity));
      const count = Math.round((intensity / 100) * 120);
      this.initOrResizePool(this.snowParticles, count, sw, sh);

      const fallSpeed = 60 + intensity * 0.6;

      for (const p of this.snowParticles) {
        p.y += fallSpeed * p.speed * deltaSeconds;
        p.x += Math.sin(this.time * 2 + p.swayPhase) * 20 * deltaSeconds;

        if (p.y > sh + 20) {
          p.y = -20;
          p.x = Math.random() * sw;
        }
        if (p.x < -20) p.x += sw + 40;
        else if (p.x > sw + 20) p.x -= sw + 40;

        this.gfx.circle(p.x, p.y, p.size);
        this.gfx.fill({ color: 0xf8fafc, alpha: p.alpha * 0.75 });
      }
    } else {
      this.snowParticles = [];
    }

    // 3. VIENTO (Hojas / Polvo arrastrado)
    if (hasWind) {
      const intensity = Math.min(100, Math.max(1, weather.wind.intensity));
      const count = Math.round((intensity / 100) * 80);
      this.initOrResizePool(this.windParticles, count, sw, sh);

      const rad = ((weather.wind.direction ?? 0) * Math.PI) / 180;
      const windSpeed = 300 + intensity * 5;
      const dx = Math.cos(rad) * windSpeed * deltaSeconds;
      const dy = Math.sin(rad) * windSpeed * deltaSeconds;

      for (const p of this.windParticles) {
        p.x += dx * p.speed;
        p.y += dy * p.speed + Math.sin(this.time * 3 + p.swayPhase) * 15 * deltaSeconds;

        if (p.x < -40) p.x += sw + 80;
        else if (p.x > sw + 40) p.x -= sw + 80;
        if (p.y < -40) p.y += sh + 80;
        else if (p.y > sh + 40) p.y -= sh + 80;

        // Dibujar pequeñas hojas / motas de polvo alargadas
        this.gfx.ellipse(p.x, p.y, p.size * 2, p.size * 0.8);
        this.gfx.fill({ color: 0xd97706, alpha: p.alpha * 0.7 });
      }
    } else {
      this.windParticles = [];
    }
  }
}
