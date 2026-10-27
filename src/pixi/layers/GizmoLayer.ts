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
  private isMaster: boolean;
  private tokensLayer?: any;
  private effectsLayer?: any;
  private allEntities: Entity[] = [];
  private cameraZoom: number = 1;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public setTokensLayer(layer: any) {
    this.tokensLayer = layer;
  }

  public setEffectsLayer(layer: any) {
    this.effectsLayer = layer;
  }

  private gridSize: number = 70;

  public update(selectedEntities: Entity[], allEntities: Entity[] = [], cameraZoom: number = 1, gridSize: number = 70) {
    this.graphics.clear();
    this.allEntities = allEntities;
    this.cameraZoom = Math.max(0.05, cameraZoom || 1);
    this.gridSize = Math.max(20, gridSize || 70);

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

    // Botón de visibilidad (ojo) en la esquina superior derecha
    this.drawEyeButton(entity, bounds);
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
    this.drawEyeButton(entity, bounds);
  }

  private drawEyeButton(entity: Entity, bounds: { offsetX: number; offsetY: number; width: number; height: number }) {
    const zoom = this.cameraZoom;
    const sx = Math.max(0.001, Math.abs(entity.scaleX || 1));
    const sy = Math.max(0.001, Math.abs(entity.scaleY || 1));
    const { offsetX, offsetY, width } = bounds;

    const eyeBtnOffsetScreen = 14;
    const cx = offsetX + width + eyeBtnOffsetScreen / (zoom * sx);
    const cy = offsetY - eyeBtnOffsetScreen / (zoom * sy);
    const r = 11 / (zoom * sx);
    const strokeW = 1.5 / (zoom * sx);
    const isVisible = entity.visibleToPlayers !== false;

    // Fondo del botón
    this.graphics.circle(cx, cy, r);
    this.graphics.fill({ color: 0x0f172a, alpha: 0.95 });
    this.graphics.stroke({ width: strokeW, color: isVisible ? 0x38bdf8 : 0xef4444 });

    // Icono del ojo
    const eyeW = r * 0.65;
    const eyeH = r * 0.42;
    const iconStroke = 1.2 / (zoom * sx);

    // Contorno del ojo (dos curvas suaves)
    this.graphics.moveTo(cx - eyeW, cy);
    this.graphics.quadraticCurveTo(cx, cy - eyeH, cx + eyeW, cy);
    this.graphics.quadraticCurveTo(cx, cy + eyeH, cx - eyeW, cy);
    this.graphics.stroke({ width: iconStroke, color: isVisible ? 0xffffff : 0x94a3b8 });

    // Pupila central
    this.graphics.circle(cx, cy, r * 0.22);
    this.graphics.fill({ color: isVisible ? 0x38bdf8 : 0x94a3b8 });

    // Si está oculto, dibujar línea diagonal tachada
    if (!isVisible) {
      const slash = r * 0.65;
      this.graphics.moveTo(cx - slash, cy - slash);
      this.graphics.lineTo(cx + slash, cy + slash);
      this.graphics.stroke({ width: 1.5 / (zoom * sx), color: 0xef4444 });
    }
  }

  public getEyeButtonWorldPos(entity: Entity): Point2D {
    const bounds = this.getEntityLocalBounds(entity);
    const zoom = this.cameraZoom;
    const sx = Math.max(0.001, Math.abs(entity.scaleX || 1));
    const sy = Math.max(0.001, Math.abs(entity.scaleY || 1));
    const eyeBtnOffsetScreen = 14;

    const localX = bounds.offsetX + bounds.width + eyeBtnOffsetScreen / (zoom * sx);
    const localY = bounds.offsetY - eyeBtnOffsetScreen / (zoom * sy);

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

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const scX = entity.scaleX || 1;
    const scY = entity.scaleY || 1;

    const worldDx = localX * scX * cosR - localY * scY * sinR;
    const worldDy = localX * scX * sinR + localY * scY * cosR;

    return {
      x: posX + worldDx,
      y: posY + worldDy
    };
  }
}
