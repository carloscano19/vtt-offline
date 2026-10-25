import { Container, Graphics } from 'pixi.js';
import { Point2D } from '../../types/entity';
import { ExploredMultiPolygon } from '../../types/game';

export class FogToolLayer extends Container {
  private isMaster: boolean;
  private revealedAreasGfx = new Graphics();
  private dragRectGfx = new Graphics();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.addChild(this.revealedAreasGfx);
    this.addChild(this.dragRectGfx);
  }

  public update(
    activeTool: string,
    revealed: ExploredMultiPolygon = [],
    dragRect: { start: Point2D; current: Point2D } | null = null,
    isPlayerPreview = false
  ) {
    this.revealedAreasGfx.clear();
    this.dragRectGfx.clear();

    if (!this.isMaster || isPlayerPreview) {
      this.visible = false;
      return;
    }

    const isFogToolActive = activeTool === 'fogReveal' || activeTool === 'fogHide';
    if (!isFogToolActive) {
      this.visible = false;
      return;
    }
    this.visible = true;

    // 1. Mostrar zonas reveladas con borde amarillo tenue para saber qué está destapado
    if (revealed && revealed.length > 0) {
      for (const poly of revealed) {
        const outer = poly[0];
        if (!outer || outer.length < 3) continue;

        this.revealedAreasGfx.poly(outer.flat());
        this.revealedAreasGfx.fill({ color: 0xfacc15, alpha: 0.08 });
        this.revealedAreasGfx.stroke({ width: 2, color: 0xfacc15, alpha: 0.6 });
      }
    }

    // 2. Rectángulo visible al revelar/ocultar mientras se arrastra
    if (dragRect) {
      const rx = Math.min(dragRect.start.x, dragRect.current.x);
      const ry = Math.min(dragRect.start.y, dragRect.current.y);
      const rw = Math.abs(dragRect.current.x - dragRect.start.x);
      const rh = Math.abs(dragRect.current.y - dragRect.start.y);

      if (rw > 1 && rh > 1) {
        const isReveal = activeTool === 'fogReveal';
        const color = isReveal ? 0xfacc15 : 0xa855f7; // amarillo para revelar, morado para ocultar

        // Relleno translúcido
        this.dragRectGfx.rect(rx, ry, rw, rh);
        this.dragRectGfx.fill({ color, alpha: 0.22 });

        // Borde discontinuo
        const dash = 8;
        const gap = 5;
        const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len === 0) return;
          const ux = dx / len;
          const uy = dy / len;
          let cur = 0;
          let draw = true;
          while (cur < len) {
            const seg = Math.min(draw ? dash : gap, len - cur);
            if (draw) {
              this.dragRectGfx.moveTo(x1 + ux * cur, y1 + uy * cur);
              this.dragRectGfx.lineTo(x1 + ux * (cur + seg), y1 + uy * (cur + seg));
            }
            cur += seg;
            draw = !draw;
          }
        };

        drawDashed(rx, ry, rx + rw, ry);
        drawDashed(rx + rw, ry, rx + rw, ry + rh);
        drawDashed(rx + rw, ry + rh, rx, ry + rh);
        drawDashed(rx, ry + rh, rx, ry);
        this.dragRectGfx.stroke({ width: 2, color, alpha: 0.9 });
      }
    }
  }
}
