import { Container, Graphics } from 'pixi.js';
import { ShowAnimationType } from '../../types/entity';

interface ShowAnimState {
  type: ShowAnimationType;
  elapsed: number;
  duration: number;
  container: Container;
  overlayGfx: Graphics;
  shadowGfx?: Graphics;
  size: number;
  scaleXMult: number;
  scaleYMult: number;
  yOffset: number;
  alphaMult: number;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export class ShowAnimationController {
  private active = new Map<string, ShowAnimState>();

  public trigger(
    id: string,
    type: ShowAnimationType = 'fade',
    container: Container,
    size: number = 70
  ) {
    this.stop(id);

    const overlayGfx = new Graphics();
    overlayGfx.label = `show-overlay-${id}`;
    container.addChild(overlayGfx);

    let shadowGfx: Graphics | undefined;
    if (type === 'fall') {
      shadowGfx = new Graphics();
      shadowGfx.label = `show-shadow-${id}`;
      container.addChildAt(shadowGfx, 0);
    }

    this.active.set(id, {
      type,
      elapsed: 0,
      duration: 0.5,
      container,
      overlayGfx,
      shadowGfx,
      size,
      scaleXMult: type === 'pop' ? 0 : 1,
      scaleYMult: type === 'pop' ? 0 : 1,
      yOffset: type === 'fall' ? -250 : 0,
      alphaMult: type === 'fade' || type === 'flash' ? 0 : 1
    });
  }

  public has(id: string): boolean {
    return this.active.has(id);
  }

  public getTransform(id: string) {
    const state = this.active.get(id);
    if (!state) return null;
    return {
      scaleXMult: state.scaleXMult,
      scaleYMult: state.scaleYMult,
      yOffset: state.yOffset,
      alphaMult: state.alphaMult
    };
  }

  public tick(deltaSeconds: number) {
    if (this.active.size === 0) return;

    for (const [id, state] of Array.from(this.active.entries())) {
      state.elapsed += deltaSeconds;
      const p = Math.min(1.0, state.elapsed / state.duration);
      const size = state.size || 70;

      if (state.type === 'fade') {
        state.alphaMult = p;
      } else if (state.type === 'pop') {
        // Escala 0 a 1 con rebote suave
        const scaleVal = Math.max(0, easeOutBack(p));
        state.scaleXMult = scaleVal;
        state.scaleYMult = scaleVal;
        state.alphaMult = Math.min(1.0, p * 3);

        // Motas de polvo disipándose
        state.overlayGfx.clear();
        const dustAlpha = (1 - p) * 0.75;
        if (dustAlpha > 0.01) {
          for (let i = 0; i < 8; i++) {
            const angle = i * (Math.PI * 2 / 8) + (i % 2 === 0 ? 0.2 : -0.1);
            const dist = (size * 0.25) + p * (size * 0.6);
            const r = Math.max(1, (size * 0.07) * (1 - p));
            state.overlayGfx.circle(Math.cos(angle) * dist, Math.sin(angle) * dist * 0.7, r);
            state.overlayGfx.fill({ color: 0xd4c5a9, alpha: dustAlpha });
          }
        }
      } else if (state.type === 'flash') {
        // Aparece rápido con resplandor blanco/dorado
        state.alphaMult = Math.min(1.0, p * 2.5);

        state.overlayGfx.clear();
        const flashAlpha = Math.max(0, 1 - p * p);
        if (flashAlpha > 0.01) {
          const radius = (size * 0.3) + p * (size * 0.95);
          state.overlayGfx.circle(0, 0, radius);
          state.overlayGfx.fill({ color: 0xfff3c4, alpha: flashAlpha * 0.85 });
          state.overlayGfx.circle(0, 0, radius * 0.65);
          state.overlayGfx.fill({ color: 0xffffff, alpha: flashAlpha });
        }
      } else if (state.type === 'fall') {
        state.alphaMult = Math.min(1.0, p * 3);

        if (p < 0.75) {
          // Fase de caída acelerada
          const fallProg = p / 0.75;
          state.yOffset = -250 * (1 - fallProg * fallProg);
          state.scaleXMult = 1.0;
          state.scaleYMult = 1.0;
        } else {
          // Impacto y rebote suave
          const impactProg = (p - 0.75) / 0.25;
          const bounce = Math.sin(impactProg * Math.PI);
          state.yOffset = -bounce * 12;
          state.scaleYMult = 1.0 - bounce * 0.18;
          state.scaleXMult = 1.0 + bounce * 0.12;

          // Polvo al aterrizar
          state.overlayGfx.clear();
          const dustAlpha = (1 - impactProg) * 0.6;
          if (dustAlpha > 0.01) {
            for (let i = 0; i < 6; i++) {
              const sign = i % 2 === 0 ? 1 : -1;
              const dist = (size * 0.3) + impactProg * (size * 0.35);
              const r = Math.max(1, (size * 0.06) * (1 - impactProg));
              state.overlayGfx.circle(sign * dist, 0, r);
              state.overlayGfx.fill({ color: 0xc8ba9e, alpha: dustAlpha });
            }
          }
        }

        // Sombra en el suelo que crece bajo él
        if (state.shadowGfx) {
          state.shadowGfx.clear();
          // Colocar la sombra en la posición del suelo (cancelando el yOffset de la entidad)
          state.shadowGfx.y = -state.yOffset;
          const shadowProg = p < 0.75 ? p / 0.75 : 1.0;
          const shadowScale = 0.25 + shadowProg * 0.75;
          const shadowAlpha = 0.15 + shadowProg * 0.45;
          state.shadowGfx.ellipse(0, 0, (size * 0.45) * shadowScale, (size * 0.2) * shadowScale);
          state.shadowGfx.fill({ color: 0x000000, alpha: shadowAlpha });
        }
      }

      if (state.elapsed >= state.duration) {
        this.stop(id);
      }
    }
  }

  public stop(id: string) {
    const state = this.active.get(id);
    if (!state) return;

    try {
      if (state.overlayGfx.parent) {
        state.overlayGfx.parent.removeChild(state.overlayGfx);
      }
      state.overlayGfx.destroy();
    } catch {}

    try {
      if (state.shadowGfx) {
        if (state.shadowGfx.parent) {
          state.shadowGfx.parent.removeChild(state.shadowGfx);
        }
        state.shadowGfx.destroy();
      }
    } catch {}

    this.active.delete(id);
  }

  public destroy() {
    for (const id of Array.from(this.active.keys())) {
      this.stop(id);
    }
  }
}
