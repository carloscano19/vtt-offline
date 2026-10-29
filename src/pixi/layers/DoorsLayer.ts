import { Container, Graphics } from 'pixi.js';
import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';

export class DoorsLayer extends Container {
  private graphics: Graphics;
  private isMaster: boolean;
  private doorFadeMap = new Map<string, { current: number; target: number }>();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public update(entities: Entity[], selectedIds: string[] = [], gridSize: number = 70, deltaSeconds: number = 0.016) {
    this.graphics.clear();

    const gSize = Math.max(20, gridSize || 70);
    const mapEntitiesById = new Map<string, Entity>();
    for (const ent of entities) {
      if (ent.type === 'map') {
        mapEntitiesById.set(ent.id, ent);
      }
    }

    const doorEntities = entities.filter((e) => e.type === 'door' && e.door);

    for (const ent of doorEntities) {
      let fadeFactor = 1.0;
      if (!this.isMaster) {
        const target = ent.visibleToPlayers !== false ? 1.0 : 0.0;
        let fade = this.doorFadeMap.get(ent.id);
        if (!fade) {
          fade = { current: target, target };
          this.doorFadeMap.set(ent.id, fade);
        }
        fade.target = target;
        const diff = fade.target - fade.current;
        if (diff !== 0) {
          const step = deltaSeconds / 0.6;
          fade.current = Math.abs(diff) <= step ? fade.target : fade.current + Math.sign(diff) * step;
        }
        fadeFactor = fade.current;
        if (fadeFactor <= 0.001) {
          continue;
        }
      } else if (ent.visibleToPlayers === false) {
        fadeFactor = 0.45;
      }

      const door = ent.door!;
      const isSelected = selectedIds.includes(ent.id);

      const parentMap = ent.mapId ? mapEntitiesById.get(ent.mapId) : undefined;
      const transformPoint = (p: Point2D): Point2D => {
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(p, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
        return p;
      };

      const p1 = transformPoint(door.p1);
      const p2 = transformPoint(door.p2);

      const doorLength = Math.max(10, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const closedAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      // Grosor proporcional a grid.size (mínimo 6 px)
      const thickness = Math.max(6, 0.18 * gSize);
      const halfThick = thickness / 2;
      const baseOp = typeof ent.opacity === 'number' ? ent.opacity : 1.0;
      const op = baseOp * fadeFactor;

      // 1. Marco (Jambas) en p1 y p2: siempre en la posición cerrada de la pared
      const jambaLength = Math.max(5, 0.1 * gSize);
      const jambaThick = Math.max(7, 0.22 * gSize);
      const closedUx = Math.cos(closedAngle);
      const closedUy = Math.sin(closedAngle);
      const closedNx = -closedUy;
      const closedNy = closedUx;

      const drawJamba = (pt: Point2D) => {
        const jx = pt.x;
        const jy = pt.y;
        const jHalfL = jambaLength / 2;
        const jHalfT = jambaThick / 2;

        const corners: Point2D[] = [
          { x: jx - closedUx * jHalfL - closedNx * jHalfT, y: jy - closedUy * jHalfL - closedNy * jHalfT },
          { x: jx + closedUx * jHalfL - closedNx * jHalfT, y: jy + closedUy * jHalfL - closedNy * jHalfT },
          { x: jx + closedUx * jHalfL + closedNx * jHalfT, y: jy + closedUy * jHalfL + closedNy * jHalfT },
          { x: jx - closedUx * jHalfL + closedNx * jHalfT, y: jy - closedUy * jHalfL - closedNy * jHalfT }
        ];

        this.graphics.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
          this.graphics.lineTo(corners[i].x, corners[i].y);
        }
        this.graphics.closePath();
        this.graphics.fill({ color: 0x27180c, alpha: op });
        this.graphics.stroke({ width: 1.5, color: 0x110b05, alpha: op });
      };

      drawJamba(p1);
      drawJamba(p2);

      // Ángulo actual de la hoja (gira sobre la bisagra p1 si está abierta)
      const currentAngle = door.isOpen ? closedAngle + (door.openAngle ?? Math.PI / 2) : closedAngle;
      const ux = Math.cos(currentAngle);
      const uy = Math.sin(currentAngle);
      const nx = -uy;
      const ny = ux;

      // 2. Bisagra en p1: pequeño rectángulo oscuro de hierro
      const hingeW = Math.max(4, 0.08 * gSize);
      const hingeH = Math.max(6, 0.14 * gSize);
      const hUx = ux;
      const hUy = uy;
      const hNx = nx;
      const hNy = ny;
      const hCorners: Point2D[] = [
        { x: p1.x - hUx * (hingeW / 2) - hNx * (hingeH / 2), y: p1.y - hUy * (hingeW / 2) - hNy * (hingeH / 2) },
        { x: p1.x + hUx * (hingeW / 2) - hNx * (hingeH / 2), y: p1.y + hUy * (hingeW / 2) - hNy * (hingeH / 2) },
        { x: p1.x + hUx * (hingeW / 2) + hNx * (hingeH / 2), y: p1.y + hUy * (hingeW / 2) + hNy * (hingeH / 2) },
        { x: p1.x - hUx * (hingeW / 2) + hNx * (hingeH / 2), y: p1.y - hUy * (hingeW / 2) + hNy * (hingeH / 2) }
      ];
      this.graphics.moveTo(hCorners[0].x, hCorners[0].y);
      for (let i = 1; i < hCorners.length; i++) {
        this.graphics.lineTo(hCorners[i].x, hCorners[i].y);
      }
      this.graphics.closePath();
      this.graphics.fill({ color: 0x1e293b, alpha: op });
      this.graphics.stroke({ width: 1, color: 0x090d16, alpha: op });

      // 3. Hoja de la puerta (rectángulo de madera)
      // Va desde p1 (0) hasta doorLength, con grosor centrado en [-halfThick, +halfThick]
      const leafCorners: Point2D[] = [
        { x: p1.x - nx * halfThick, y: p1.y - ny * halfThick },
        { x: p1.x + ux * doorLength - nx * halfThick, y: p1.y + uy * doorLength - ny * halfThick },
        { x: p1.x + ux * doorLength + nx * halfThick, y: p1.y + uy * doorLength + ny * halfThick },
        { x: p1.x + nx * halfThick, y: p1.y + ny * halfThick }
      ];

      this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
      for (let i = 1; i < leafCorners.length; i++) {
        this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
      }
      this.graphics.closePath();
      // Madera: relleno marrón #8b5a2b, borde oscuro #3b2412
      this.graphics.fill({ color: 0x8b5a2b, alpha: (door.isOpen ? 0.95 : 1.0) * op });
      this.graphics.stroke({ width: 1.5, color: 0x3b2412, alpha: op });

      // 4. Líneas longitudinales que marcan las tablas de la hoja
      const plankOffsets = [-halfThick * 0.35, halfThick * 0.35];
      for (const po of plankOffsets) {
        this.graphics.moveTo(p1.x + nx * po, p1.y + ny * po);
        this.graphics.lineTo(p1.x + ux * doorLength + nx * po, p1.y + uy * doorLength + ny * po);
        this.graphics.stroke({ width: 1, color: 0x5a3818, alpha: 0.8 * op });
      }

      // 5. Pomos dorados: círculo dorado (#d4af37, borde oscuro) de radio ≈ 0.07 × grid.size
      // A un 85 % del largo desde la bisagra, visible por ambas caras de la hoja
      const knobDist = doorLength * 0.85;
      const knobRadius = Math.max(2.5, 0.07 * gSize);
      const knobFaceOffset = halfThick;

      const knob1: Point2D = {
        x: p1.x + ux * knobDist - nx * knobFaceOffset,
        y: p1.y + uy * knobDist - ny * knobFaceOffset
      };
      const knob2: Point2D = {
        x: p1.x + ux * knobDist + nx * knobFaceOffset,
        y: p1.y + uy * knobDist + ny * knobFaceOffset
      };

      for (const kp of [knob1, knob2]) {
        this.graphics.circle(kp.x, kp.y, knobRadius);
        this.graphics.fill({ color: 0xd4af37, alpha: op });
        this.graphics.stroke({ width: 1, color: 0x3b2412, alpha: op });
      }

      // 6. Resaltado de selección (contorno azul celeste)
      if (isSelected) {
        this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
        for (let i = 1; i < leafCorners.length; i++) {
          this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
        }
        this.graphics.closePath();
        this.graphics.stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
      }

      // 7. Candado / Punto rojo de puerta cerrada con llave (Solo Máster)
      if (this.isMaster && door.isLocked) {
        const midX = p1.x + ux * (doorLength * 0.5);
        const midY = p1.y + uy * (doorLength * 0.5);
        const lockR = Math.max(3.5, 0.06 * gSize);

        this.graphics.circle(midX, midY, lockR);
        this.graphics.fill({ color: 0xef4444, alpha: 1 });
        this.graphics.stroke({ width: 1.5, color: 0xffffff, alpha: 1 });
      }
    }
  }
}

