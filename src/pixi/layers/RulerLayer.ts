import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { RulerState } from '../../types/game';
import { calculateRulerDistance } from '../../modules/tools/rulerCalculator';

export class RulerLayer extends Container {
  private graphics: Graphics;
  private badgeContainer: Container;
  private badgeText: Text;
  private badgeBg: Graphics;
  private isMaster: boolean;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.badgeContainer = new Container();
    this.badgeBg = new Graphics();
    this.badgeText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#ffffff',
        align: 'center'
      })
    });
    this.badgeText.anchor.set(0.5);

    this.badgeContainer.addChild(this.badgeBg);
    this.badgeContainer.addChild(this.badgeText);
    this.addChild(this.badgeContainer);
  }

  public update(ruler: RulerState, gridSize: number) {
    this.graphics.clear();
    this.badgeBg.clear();

    // En jugadores solo se muestra si el máster ha habilitado visibleToPlayers
    if (!this.isMaster && !ruler.visibleToPlayers) {
      this.visible = false;
      return;
    }

    if (!ruler.startPos || !ruler.currentPos) {
      this.visible = false;
      return;
    }

    this.visible = true;
    const { startPos, currentPos, mode, diagonalRule } = ruler;
    const measurement = calculateRulerDistance(startPos, currentPos, gridSize, mode, diagonalRule);

    if (mode === 'radial') {
      const radius = measurement.pixelDistance;

      // Círculo exterior y relleno semitransparente
      this.graphics.circle(startPos.x, startPos.y, radius);
      this.graphics.fill({ color: 0x38bdf8, alpha: 0.15 });
      this.graphics.stroke({ width: 2.5, color: 0x38bdf8, alpha: 0.9 });

      // Línea del radio desde el centro hasta el puntero
      this.graphics.moveTo(startPos.x, startPos.y);
      this.graphics.lineTo(currentPos.x, currentPos.y);
      this.graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.75 });

      // Punto central
      this.graphics.circle(startPos.x, startPos.y, 4);
      this.graphics.fill({ color: 0x38bdf8, alpha: 1 });
    } else {
      // Modo línea recta
      this.graphics.moveTo(startPos.x, startPos.y);
      this.graphics.lineTo(currentPos.x, currentPos.y);
      this.graphics.stroke({ width: 3, color: 0x38bdf8, alpha: 0.95 });

      // Puntos en inicio y fin
      this.graphics.circle(startPos.x, startPos.y, 5);
      this.graphics.circle(currentPos.x, currentPos.y, 5);
      this.graphics.fill({ color: 0x38bdf8, alpha: 1 });
    }

    // Actualizar texto del badge
    this.badgeText.text = measurement.displayText;
    const paddingX = 14;
    const paddingY = 8;
    const textWidth = this.badgeText.width;
    const textHeight = this.badgeText.height;
    const bgWidth = textWidth + paddingX * 2;
    const bgHeight = textHeight + paddingY * 2;

    this.badgeBg.roundRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 6);
    this.badgeBg.fill({ color: 0x0f172a, alpha: 0.9 });
    this.badgeBg.stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.9 });

    // Posicionar el badge cerca del puntero
    this.badgeContainer.x = currentPos.x;
    this.badgeContainer.y = currentPos.y - 28;
  }
}
