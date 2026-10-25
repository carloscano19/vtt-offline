import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CameraState, PlayerViewport } from '../../types/game';

export class PlayerFrameLayout extends Container {
  private graphics: Graphics;
  private labelText: Text;
  private labelBg: Graphics;
  private isMaster: boolean;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.labelBg = new Graphics();
    this.labelText = new Text({
      text: 'TV',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: '#10b981',
        align: 'center'
      })
    });
    this.labelText.anchor.set(0.5);

    this.addChild(this.labelBg);
    this.addChild(this.labelText);
  }

  public getFrameWorldBounds(playerCamera: CameraState, viewport?: PlayerViewport) {
    const vpW = viewport?.width || 1920;
    const vpH = viewport?.height || 1080;
    const zoom = Math.max(0.05, playerCamera.zoom || 1);

    const worldW = vpW / zoom;
    const worldH = vpH / zoom;

    const x = playerCamera.x - worldW / 2;
    const y = playerCamera.y - worldH / 2;

    return { x, y, width: worldW, height: worldH };
  }

  public update(playerCamera: CameraState, viewport?: PlayerViewport, visible = true) {
    this.graphics.clear();
    this.labelBg.clear();

    if (!this.isMaster || !visible) {
      this.visible = false;
      return;
    }

    this.visible = true;
    const bounds = this.getFrameWorldBounds(playerCamera, viewport);
    const { x, y, width, height } = bounds;

    // Dibujar marco verde discontinuo
    // pixi v8 stroke with dash can be drawn with lineTo steps or rect stroke
    this.graphics.rect(x, y, width, height);
    this.graphics.stroke({
      width: 2.5 / Math.min(1, playerCamera.zoom),
      color: 0x10b981,
      alpha: 0.85
    });

    // Dibujar manijas en las 4 esquinas para redimensionar (zoom del marco)
    const handleRadius = 6 / Math.min(1, playerCamera.zoom);
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ];

    for (const c of corners) {
      this.graphics.circle(c.x, c.y, handleRadius);
      this.graphics.fill({ color: 0x10b981 });
      this.graphics.stroke({ width: 1.5, color: 0xffffff });
    }

    // Etiqueta "TV" en la esquina superior izquierda
    this.labelText.x = x + 24;
    this.labelText.y = y + 14;

    this.labelBg.roundRect(x + 8, y + 4, 32, 20, 4);
    this.labelBg.fill({ color: 0x064e3b, alpha: 0.9 });
    this.labelBg.stroke({ width: 1, color: 0x10b981 });
  }
}
