import { Container, Graphics } from 'pixi.js';
import { Entity } from '../../types/entity';

export interface GizmoBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type TransformHandleType = 'rotate' | 'scale-tl' | 'scale-tr' | 'scale-br' | 'scale-bl' | 'body';

export class GizmoLayer extends Container {
  private graphics: Graphics;
  private isMaster: boolean;
  private tokensLayer?: any;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public setTokensLayer(layer: any) {
    this.tokensLayer = layer;
  }

  public update(selectedEntities: Entity[]) {
    this.graphics.clear();

    if (!this.isMaster || selectedEntities.length === 0) {
      return;
    }

    // Dibujar gizmo para la entidad seleccionada principal
    const entity = selectedEntities[0];
    if (entity.locked) {
      // Si está bloqueada, dibujar borde sutil rojo sin controles de transformación
      this.drawLockedOutline(entity);
      return;
    }

    this.drawTransformGizmo(entity);
  }

  public getEntityLocalBounds(entity: Entity) {
    if (entity.type === 'map') {
      const w = (entity.mapData?.gridWidth ?? 10) * (entity.mapData?.pixelsPerGrid ?? 70);
      const h = (entity.mapData?.gridHeight ?? 10) * (entity.mapData?.pixelsPerGrid ?? 70);
      return {
        offsetX: 0,
        offsetY: 0,
        width: w,
        height: h
      };
    }

    // Token u objeto (anclado al centro)
    let w = 70;
    let h = 70;
    if (this.tokensLayer && typeof this.tokensLayer.getEntityBounds === 'function') {
      const bounds = this.tokensLayer.getEntityBounds(entity.id);
      if (bounds) {
        w = bounds.width;
        h = bounds.height;
      }
    }

    return {
      offsetX: -w / 2,
      offsetY: -h / 2,
      width: w,
      height: h
    };
  }

  private drawTransformGizmo(entity: Entity) {
    const bounds = this.getEntityLocalBounds(entity);

    // Guardar contexto gráfico mediante transformaciones relativas
    this.graphics.position.set(entity.x, entity.y);
    this.graphics.rotation = entity.rotation;
    this.graphics.scale.set(entity.scaleX, entity.scaleY);

    const { offsetX, offsetY, width, height } = bounds;

    // Caja delimitadora
    this.graphics.rect(offsetX, offsetY, width, height);
    this.graphics.stroke({ width: 2 / Math.abs(entity.scaleX || 1), color: 0x38bdf8, alpha: 0.9 });

    // Manija de rotación superior
    const handleDist = 25 / Math.abs(entity.scaleY || 1);
    const rotHandleY = offsetY - handleDist;
    const centerX = offsetX + width / 2;

    this.graphics.moveTo(centerX, offsetY);
    this.graphics.lineTo(centerX, rotHandleY);
    this.graphics.stroke({ width: 1.5 / Math.abs(entity.scaleX || 1), color: 0x38bdf8, alpha: 0.8 });

    this.graphics.circle(centerX, rotHandleY, 6 / Math.abs(entity.scaleX || 1));
    this.graphics.fill({ color: 0x38bdf8 });
    this.graphics.stroke({ width: 1.5, color: 0xffffff });

    // Manijas de esquina para escalado
    const handleSize = 8 / Math.abs(entity.scaleX || 1);
    const corners = [
      { x: offsetX, y: offsetY },
      { x: offsetX + width, y: offsetY },
      { x: offsetX + width, y: offsetY + height },
      { x: offsetX, y: offsetY + height }
    ];

    for (const c of corners) {
      this.graphics.rect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      this.graphics.fill({ color: 0xffffff });
      this.graphics.stroke({ width: 1.5, color: 0x0284c7 });
    }
  }

  private drawLockedOutline(entity: Entity) {
    const bounds = this.getEntityLocalBounds(entity);
    this.graphics.position.set(entity.x, entity.y);
    this.graphics.rotation = entity.rotation;
    this.graphics.scale.set(entity.scaleX, entity.scaleY);

    this.graphics.rect(bounds.offsetX, bounds.offsetY, bounds.width, bounds.height);
    this.graphics.stroke({ width: 2 / Math.abs(entity.scaleX || 1), color: 0xef4444, alpha: 0.75 });
  }
}
