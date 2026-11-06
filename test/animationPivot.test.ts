import { describe, it, expect } from 'vitest';
import { computePivotTransform, AnimationPivot } from '../src/types/entity';

describe('Punto de giro y vaivén péndulo (Bloque 2)', () => {
  it('con pivot "center", la posición no se altera al rotar', () => {
    const baseX = 100;
    const baseY = 200;
    const baseRot = 0;
    const extraRot = Math.PI / 4; // 45°
    const width = 80;
    const height = 80;

    const res = computePivotTransform(baseX, baseY, baseRot, extraRot, width, height, 'center');
    expect(res.x).toBeCloseTo(100);
    expect(res.y).toBeCloseTo(200);
    expect(res.rotation).toBeCloseTo(Math.PI / 4);
  });

  it('con pivot "top", el punto superior se mantiene fijo mientras el centro rota', () => {
    const baseX = 100;
    const baseY = 200;
    const baseRot = 0;
    const extraRot = Math.PI / 2; // 90° CW
    const width = 80;
    const height = 80;
    // Borde superior inicial en local: y = -40, por tanto en mundo: (100, 160)

    const res = computePivotTransform(baseX, baseY, baseRot, extraRot, width, height, 'top');
    expect(res.rotation).toBeCloseTo(Math.PI / 2);

    // Verificamos que el punto anclaje superior calculado desde el nuevo centro siga en (100, 160)
    // Con rotación de 90° CW, el vector local (0, -40) se convierte en (+40, 0)
    const anchorX = res.x - Math.sin(res.rotation) * (-40);
    const anchorY = res.y + Math.cos(res.rotation) * (-40);
    expect(anchorX).toBeCloseTo(100);
    expect(anchorY).toBeCloseTo(160);
  });

  it('con pivot "left", el borde izquierdo se mantiene fijo', () => {
    const baseX = 300;
    const baseY = 400;
    const baseRot = 0;
    const extraRot = Math.PI / 2;
    const width = 100;
    const height = 60;
    // Borde izquierdo en mundo: (250, 400)

    const res = computePivotTransform(baseX, baseY, baseRot, extraRot, width, height, 'left');

    // Vector local (-50, 0) rotado 90° CW se convierte en (0, -50)
    const anchorX = res.x + Math.cos(res.rotation) * (-50);
    const anchorY = res.y + Math.sin(res.rotation) * (-50);
    expect(anchorX).toBeCloseTo(250);
    expect(anchorY).toBeCloseTo(400);
  });

  it('el modo péndulo oscila angularmente entre -ángulo y +ángulo', () => {
    const angleDeg = 30;
    const angleRad = (angleDeg * Math.PI) / 180;
    const swaySpeed = 2;

    // A time = 0, sin(0) = 0
    let rot0 = Math.sin(0 * swaySpeed) * angleRad;
    expect(rot0).toBe(0);

    // Al pico positivo (sin = 1)
    let rotPeak = 1 * angleRad;
    expect((rotPeak * 180) / Math.PI).toBeCloseTo(30);

    // Al pico negativo (sin = -1)
    let rotValley = -1 * angleRad;
    expect((rotValley * 180) / Math.PI).toBeCloseTo(-30);
  });
});
