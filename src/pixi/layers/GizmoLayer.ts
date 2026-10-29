import { Container, Graphics } from 'pixi.js';
import { Entity } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';

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
  private coneGfx: Graphics;
  private eyeGfx: Graphics;
  private isMaster: boolean;
  private tokensLayer?: any;
  private effectsLayer?: any;
  private allEntities: Entity[] = [];
  private cameraZoom: number = 1;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.coneGfx = new Graphics();
    this.graphics = new Graphics();
    this.eyeGfx = new Graphics();
    this.addChild(this.coneGfx);
    this.addChild(this.graphics);
    this.addChild(this.eyeGfx);
  }

  public setTokensLayer(layer: any) {
    this.tokensLayer = layer;
  }

  public setEffectsLayer(layer: any) {
    this.effectsLayer = layer;
  }

  private gridSize: number = 70;

  public update(selectedEntities: Entity[], allEntities: Entity[] = [], cameraZoom: number = 1, gridSize: number = 70) {
    this.coneGfx.clear();
    this.graphics.clear();
    this.eyeGfx.clear();
    this.allEntities = allEntities;
    this.cameraZoom = Math.max(0.05, cameraZoom || 1);
    this.gridSize = Math.max(20, gridSize || 70);

    if (!this.isMaster || selectedEntities.length === 0) {
      return;
    }

    // Dibujar gizmo para la entidad seleccionada principal
    const entity = selectedEntities[0];

    // Previsualización de cono para visión o luz direccional
    this.drawConePreview(entity);

    if (entity.locked) {
      // Si está bloqueada, dibujar borde sutil rojo sin controles de transformación
      this.drawLockedOutline(entity);
      return;
    }

    this.drawTransformGizmo(entity);
  }

  private drawConePreview(entity: Entity) {
    let hasCone = false;
    let totalRangePx = 0;
    let coneAngle = 60;
    let directionOffset = 0;
    let color = 0x38bdf8; // Celeste para visión

    if (entity.type === 'token' && entity.vision?.active && entity.vision.shape === 'cone') {
      const bright = entity.vision.brightRangeInSquares ?? entity.vision.rangeInSquares ?? 4;
      const dim = entity.vision.dimRangeInSquares ?? (entity.vision.rangeInSquares !== undefined ? 0 : 2);
      const totalSquares = bright > 0 ? (dim > 0 ? bright + dim : bright) : 0;
      totalRangePx = totalSquares * this.gridSize;
      coneAngle = entity.vision.coneAngle ?? 60;
      directionOffset = entity.vision.directionOffset ?? 0;
      color = 0x38bdf8;
      hasCone = totalRangePx > 0;
    } else if (
      (entity.type === 'light' || (entity.type === 'effect' && entity.effect?.emitsLight)) &&
      entity.light?.shape === 'cone'
    ) {
      const scaleMultiplier =
        entity.type === 'effect'
          ? Math.max(0.2, (Math.abs(entity.scaleX || 1) + Math.abs(entity.scaleY || 1)) / 2)
          : 1;
      const brightSquares = (entity.light.brightRadiusInSquares ?? 4) * scaleMultiplier;
      const dimSquares = (entity.light.dimRadiusInSquares ?? 2) * scaleMultiplier;
      const totalSquares = brightSquares > 0 ? (dimSquares > 0 ? brightSquares + dimSquares : brightSquares) : 0;
      totalRangePx = totalSquares * this.gridSize;
      coneAngle = entity.light.coneAngle ?? 60;
      directionOffset = entity.light.directionOffset ?? 0;
      color = 0xfbbf24; // Ámbar para luz
      hasCone = totalRangePx > 0;
    }

    if (!hasCone || totalRangePx <= 0) return;

    let posX = entity.x;
    let posY = entity.y;
    let rotation = entity.rotation ?? 0;

    if (entity.mapId && this.allEntities.length > 0) {
      const parentMap = this.allEntities.find((e) => e.id === entity.mapId);
      if (parentMap) {
        const wp = localToWorld(
          { x: entity.x, y: entity.y },
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        );
        posX = wp.x;
        posY = wp.y;
        rotation = rotation + parentMap.rotation;
      }
    }

    const centralAngle = rotation + (directionOffset * Math.PI) / 180;
    const halfAngle = ((coneAngle / 2) * Math.PI) / 180;
    const startAngle = centralAngle - halfAngle;
    const endAngle = centralAngle + halfAngle;

    const strokeWidth = 1.5 / this.cameraZoom;

    this.coneGfx.moveTo(posX, posY);
    this.coneGfx.lineTo(posX + totalRangePx * Math.cos(startAngle), posY + totalRangePx * Math.sin(startAngle));
    this.coneGfx.arc(posX, posY, totalRangePx, startAngle, endAngle, false);
    this.coneGfx.fill({ color, alpha: 0.08 });
    this.coneGfx.stroke({ width: strokeWidth, color, alpha: 0.85 });

    if (entity.type === 'token') {
      const tokenSizePx = Math.max(0.2, Math.abs(entity.scaleX || 1)) * this.gridSize;
      const selfRadiusPx = (tokenSizePx / 2) + 0.25 * this.gridSize;
      this.coneGfx.circle(posX, posY, selfRadiusPx);
      this.coneGfx.fill({ color, alpha: 0.08 });
      this.coneGfx.stroke({ width: strokeWidth, color, alpha: 0.6 });
    }
  }

  public getEntityLocalBounds(entity: Entity) {
    if (entity.type === 'door') {
      const w = entity.door?.length ?? 70;
      const h = Math.max(6, 0.18 * this.gridSize);
      return {
        offsetX: -w / 2,
        offsetY: -h / 2,
        width: w,
        height: h
      };
    }

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

    if (entity.type === 'effect') {
      let w = 70;
      let h = 70;
      if (this.effectsLayer && typeof this.effectsLayer.getEntityBounds === 'function') {
        const bounds = this.effectsLayer.getEntityBounds(entity.id);
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

    let posX = entity.x;
    let posY = entity.y;
    let rotation = entity.rotation;

    if (entity.type === 'door' && entity.mapId && this.allEntities.length > 0) {
      const parentMap = this.allEntities.find((e) => e.id === entity.mapId);
      if (parentMap) {
        const wp = localToWorld(
          { x: entity.x, y: entity.y },
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        );
        posX = wp.x;
        posY = wp.y;
        rotation = entity.rotation + parentMap.rotation;
      }
    }

    // Guardar contexto gráfico mediante transformaciones relativas
    this.graphics.position.set(posX, posY);
    this.graphics.rotation = rotation;
    this.graphics.scale.set(entity.scaleX, entity.scaleY);

    const zoom = this.cameraZoom;
    const sx = Math.max(0.001, Math.abs(entity.scaleX || 1));
    const sy = Math.max(0.001, Math.abs(entity.scaleY || 1));
    const { offsetX, offsetY, width, height } = bounds;

    // Caja delimitadora (borde constante de aprox 2px en pantalla)
    const boxStroke = 2 / (zoom * sx);
    this.graphics.rect(offsetX, offsetY, width, height);
    this.graphics.stroke({ width: boxStroke, color: 0x38bdf8, alpha: 0.9 });

    // Manija de rotación superior (distancia constante de 26px en pantalla)
    const handleDist = 26 / (zoom * sy);
    const rotHandleY = offsetY - handleDist;
    const centerX = offsetX + width / 2;

    const rotLineWidth = 1.5 / (zoom * sx);
    this.graphics.moveTo(centerX, offsetY);
    this.graphics.lineTo(centerX, rotHandleY);
    this.graphics.stroke({ width: rotLineWidth, color: 0x38bdf8, alpha: 0.8 });

    // Círculo de rotación (radio de 5px en pantalla, diámetro aprox 10px)
    const rotRadius = 5 / (zoom * sx);
    const rotStroke = 1.5 / (zoom * sx);
    this.graphics.circle(centerX, rotHandleY, rotRadius);
    this.graphics.fill({ color: 0x38bdf8 });
    this.graphics.stroke({ width: rotStroke, color: 0xffffff });

    // Manijas de esquina para escalado (cuadrados de aprox 10px en pantalla)
    const handleSizeX = 10 / (zoom * sx);
    const handleSizeY = 10 / (zoom * sy);
    const cornerStroke = 1.5 / (zoom * sx);
    const corners = [
      { x: offsetX, y: offsetY },
      { x: offsetX + width, y: offsetY },
      { x: offsetX + width, y: offsetY + height },
      { x: offsetX, y: offsetY + height }
    ];

    for (const c of corners) {
      this.graphics.rect(c.x - handleSizeX / 2, c.y - handleSizeY / 2, handleSizeX, handleSizeY);
      this.graphics.fill({ color: 0xffffff });
      this.graphics.stroke({ width: cornerStroke, color: 0x0284c7 });
    }

    // Botón de visibilidad (ojo) en la esquina superior derecha en pantalla
    this.drawEyeButton(entity);
  }

  private drawLockedOutline(entity: Entity) {
    const bounds = this.getEntityLocalBounds(entity);

    let posX = entity.x;
    let posY = entity.y;
    let rotation = entity.rotation;

    if (entity.type === 'door' && entity.mapId && this.allEntities.length > 0) {
      const parentMap = this.allEntities.find((e) => e.id === entity.mapId);
      if (parentMap) {
        const wp = localToWorld(
          { x: entity.x, y: entity.y },
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        );
        posX = wp.x;
        posY = wp.y;
        rotation = entity.rotation + parentMap.rotation;
      }
    }

    this.graphics.position.set(posX, posY);
    this.graphics.rotation = rotation;
    this.graphics.scale.set(entity.scaleX, entity.scaleY);

    const zoom = this.cameraZoom;
    const sx = Math.max(0.001, Math.abs(entity.scaleX || 1));
    const lockedStroke = 2 / (zoom * sx);
    this.graphics.rect(bounds.offsetX, bounds.offsetY, bounds.width, bounds.height);
    this.graphics.stroke({ width: lockedStroke, color: 0xef4444, alpha: 0.75 });

    // Botón de visibilidad (ojo) también en entidades bloqueadas seleccionadas
    this.drawEyeButton(entity);
  }

  private drawEyeButton(entity: Entity) {
    const { x: cx, y: cy } = this.getEyeButtonWorldPos(entity);
    const zoom = this.cameraZoom;
    const r = 11 / zoom;
    const strokeW = 1.5 / zoom;
    const isVisible = entity.visibleToPlayers !== false;

    // Fondo del botón
    this.eyeGfx.circle(cx, cy, r);
    this.eyeGfx.fill({ color: 0x0f172a, alpha: 0.95 });
    this.eyeGfx.stroke({ width: strokeW, color: isVisible ? 0x38bdf8 : 0xef4444 });

    // Icono del ojo (siempre derecho y horizontal)
    const eyeW = r * 0.65;
    const eyeH = r * 0.42;
    const iconStroke = 1.2 / zoom;

    // Contorno del ojo (dos curvas suaves horizontales)
    this.eyeGfx.moveTo(cx - eyeW, cy);
    this.eyeGfx.quadraticCurveTo(cx, cy - eyeH, cx + eyeW, cy);
    this.eyeGfx.quadraticCurveTo(cx, cy + eyeH, cx - eyeW, cy);
    this.eyeGfx.stroke({ width: iconStroke, color: isVisible ? 0xffffff : 0x94a3b8 });

    // Pupila central
    this.eyeGfx.circle(cx, cy, r * 0.22);
    this.eyeGfx.fill({ color: isVisible ? 0x38bdf8 : 0x94a3b8 });

    // Si está oculto, dibujar línea diagonal tachada
    if (!isVisible) {
      const slash = r * 0.65;
      this.eyeGfx.moveTo(cx - slash, cy - slash);
      this.eyeGfx.lineTo(cx + slash, cy + slash);
      this.eyeGfx.stroke({ width: 1.5 / zoom, color: 0xef4444 });
    }
  }

  public getEyeButtonWorldPos(entity: Entity): { x: number; y: number } {
    const bounds = this.getEntityLocalBounds(entity);
    const zoom = this.cameraZoom;

    let posX = entity.x;
    let posY = entity.y;
    let rotation = entity.rotation;

    if (entity.type === 'door' && entity.mapId && this.allEntities.length > 0) {
      const parentMap = this.allEntities.find((e) => e.id === entity.mapId);
      if (parentMap) {
        const wp = localToWorld(
          { x: entity.x, y: entity.y },
          { x: parentMap.x, y: parentMap.y },
          parentMap.rotation,
          parentMap.scaleX,
          parentMap.scaleY
        );
        posX = wp.x;
        posY = wp.y;
        rotation = entity.rotation + parentMap.rotation;
      }
    }

    const { offsetX, offsetY, width, height } = bounds;
    const localCorners = [
      { x: offsetX, y: offsetY },
      { x: offsetX + width, y: offsetY },
      { x: offsetX + width, y: offsetY + height },
      { x: offsetX, y: offsetY + height }
    ];

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const scX = entity.scaleX || 1;
    const scY = entity.scaleY || 1;

    let maxX = -Infinity;
    let minY = Infinity;

    for (const c of localCorners) {
      const wx = posX + (c.x * scX * cosR - c.y * scY * sinR);
      const wy = posY + (c.x * scX * sinR + c.y * scY * cosR);
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
    }

    const eyeBtnOffsetScreen = 14;
    return {
      x: maxX + eyeBtnOffsetScreen / zoom,
      y: minY - eyeBtnOffsetScreen / zoom
    };
  }
}
