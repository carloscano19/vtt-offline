import { Container, Graphics } from 'pixi.js';
import { GridConfig, CameraState } from '../../types/game';

export class GridLayer extends Container {
  private graphics: Graphics;

  constructor() {
    super();
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public update(grid: GridConfig, camera: CameraState, canvasWidth: number, canvasHeight: number) {
    this.graphics.clear();

    if (!grid.visible || grid.opacity <= 0 || grid.size <= 0) {
      return;
    }

    const zoom = Math.max(0.1, camera.zoom);
    const halfW = canvasWidth / 2 / zoom;
    const halfH = canvasHeight / 2 / zoom;

    const minX = camera.x - halfW;
    const maxX = camera.x + halfW;
    const minY = camera.y - halfH;
    const maxY = camera.y + halfH;

    const step = grid.size;
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    // Convertir color hex string (#ffffff) a número
    const hexColor = parseInt(grid.color.replace('#', ''), 16) || 0xffffff;
    const strokeWidth = 1;

    // Dibujar líneas verticales
    for (let x = startX; x <= endX; x += step) {
      this.graphics.moveTo(x, startY);
      this.graphics.lineTo(x, endY);
    }

    // Dibujar líneas horizontales
    for (let y = startY; y <= endY; y += step) {
      this.graphics.moveTo(startX, y);
      this.graphics.lineTo(endX, y);
    }

    this.graphics.stroke({
      width: strokeWidth,
      color: hexColor,
      alpha: grid.opacity
    });
  }
}
