import { Container, Graphics } from 'pixi.js';
import { Entity, Point2D, DoorType, SlidingMaterial } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';
import { doorAnimationManager } from '../../modules/doors/doorAnimationManager';

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
    const activeDoorIds = new Set<string>();

    for (const ent of doorEntities) {
      activeDoorIds.add(ent.id);
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

      // Progreso fluido de apertura (0.0 = cerrado, 1.0 = completamente abierto en ~0.5s)
      const progress = doorAnimationManager.update(ent.id, door.isOpen, deltaSeconds);

      // Grosor proporcional a grid.size (mínimo 6 px)
      const thickness = Math.max(6, 0.18 * gSize);
      const halfThick = thickness / 2;
      const baseOp = typeof ent.opacity === 'number' ? ent.opacity : 1.0;
      const op = baseOp * fadeFactor;

      const closedUx = Math.cos(closedAngle);
      const closedUy = Math.sin(closedAngle);
      const closedNx = -closedUy;
      const closedNy = closedUx;

      // 1. Marco (Jambas) en p1 y p2: siempre en la posición cerrada de la pared
      const jambaLength = Math.max(5, 0.1 * gSize);
      const jambaThick = Math.max(7, 0.22 * gSize);

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

      const doorType: DoorType = door.type || 'normal';
      let leafCorners: Point2D[] = [];

      if (doorType === 'revolving') {
        // Puerta Giratoria: gira 180° sobre su centro
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const currentAngle = closedAngle + Math.PI * progress;
        const ux = Math.cos(currentAngle);
        const uy = Math.sin(currentAngle);
        const nx = -uy;
        const ny = ux;

        const halfL = doorLength / 2;
        leafCorners = [
          { x: midX - ux * halfL - nx * halfThick, y: midY - uy * halfL - ny * halfThick },
          { x: midX + ux * halfL - nx * halfThick, y: midY + uy * halfL - ny * halfThick },
          { x: midX + ux * halfL + nx * halfThick, y: midY + uy * halfL + ny * halfThick },
          { x: midX - ux * halfL + nx * halfThick, y: midY - uy * halfL - ny * halfThick }
        ];

        this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
        for (let i = 1; i < leafCorners.length; i++) {
          this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
        }
        this.graphics.closePath();
        // Piedra antigua/cripta: relleno gris oscuro #3f3f46, borde #18181b
        this.graphics.fill({ color: 0x3f3f46, alpha: (door.isOpen ? 0.95 : 1.0) * op });
        this.graphics.stroke({ width: 1.5, color: 0x18181b, alpha: op });

        // Bandas de hierro perpendiculares
        for (const distMult of [-0.4, 0.4]) {
          const bx = midX + ux * (halfL * distMult);
          const by = midY + uy * (halfL * distMult);
          this.graphics.moveTo(bx - nx * halfThick, by - ny * halfThick);
          this.graphics.lineTo(bx + nx * halfThick, by + ny * halfThick);
          this.graphics.stroke({ width: 2, color: 0x18181b, alpha: 0.9 * op });
        }

        // Pivote central (disco de hierro/bronce)
        const pivotR = Math.max(3.5, 0.09 * gSize);
        this.graphics.circle(midX, midY, pivotR);
        this.graphics.fill({ color: 0x71717a, alpha: op });
        this.graphics.stroke({ width: 1.5, color: 0x18181b, alpha: op });
        this.graphics.circle(midX, midY, pivotR * 0.4);
        this.graphics.fill({ color: 0xd4af37, alpha: op });

      } else if (doorType === 'sliding') {
        // Puerta Deslizante: la hoja se desliza lateralmente a lo largo de la pared
        const slideOffset = doorLength * progress;
        const startX = p1.x + closedUx * slideOffset;
        const startY = p1.y + closedUy * slideOffset;
        const endX = p2.x + closedUx * slideOffset;
        const endY = p2.y + closedUy * slideOffset;

        leafCorners = [
          { x: startX - closedNx * halfThick, y: startY - closedNy * halfThick },
          { x: endX - closedNx * halfThick, y: endY - closedNy * halfThick },
          { x: endX + closedNx * halfThick, y: endY + closedNy * halfThick },
          { x: startX + closedNx * halfThick, y: startY + closedNy * halfThick }
        ];

        // Riel o guía en la pared
        const trackStart = p1;
        const trackEnd = { x: p2.x + closedUx * doorLength, y: p2.y + closedUy * doorLength };
        this.graphics.moveTo(trackStart.x - closedNx * (halfThick + 1), trackStart.y - closedNy * (halfThick + 1));
        this.graphics.lineTo(trackEnd.x - closedNx * (halfThick + 1), trackEnd.y - closedNy * (halfThick + 1));
        this.graphics.stroke({ width: 2, color: 0x334155, alpha: 0.7 * op });

        const material: SlidingMaterial = door.slidingMaterial || 'wood';

        if (material === 'bars') {
          // Reja / Portcullis: barras de hierro
          this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
          for (let i = 1; i < leafCorners.length; i++) {
            this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
          }
          this.graphics.closePath();
          this.graphics.fill({ color: 0x0f172a, alpha: 0.35 * op });
          this.graphics.stroke({ width: 2, color: 0x1e293b, alpha: op });

          // Barras verticales
          const numBars = Math.max(3, Math.floor(doorLength / (0.16 * gSize)));
          for (let b = 1; b < numBars; b++) {
            const t = b / numBars;
            const bx = startX + closedUx * (doorLength * t);
            const by = startY + closedUy * (doorLength * t);
            this.graphics.moveTo(bx - closedNx * halfThick, by - closedNy * halfThick);
            this.graphics.lineTo(bx + closedNx * halfThick, by + closedNy * halfThick);
            this.graphics.stroke({ width: 2, color: 0x475569, alpha: 0.95 * op });
          }
        } else if (material === 'stone') {
          // Losa de piedra
          this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
          for (let i = 1; i < leafCorners.length; i++) {
            this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
          }
          this.graphics.closePath();
          this.graphics.fill({ color: 0x52525b, alpha: (door.isOpen ? 0.95 : 1.0) * op });
          this.graphics.stroke({ width: 1.5, color: 0x27272a, alpha: op });

          // Línea central cincelada
          this.graphics.moveTo(startX, startY);
          this.graphics.lineTo(endX, endY);
          this.graphics.stroke({ width: 1, color: 0x71717a, alpha: 0.7 * op });
        } else {
          // Madera
          this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
          for (let i = 1; i < leafCorners.length; i++) {
            this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
          }
          this.graphics.closePath();
          this.graphics.fill({ color: 0x8b5a2b, alpha: (door.isOpen ? 0.95 : 1.0) * op });
          this.graphics.stroke({ width: 1.5, color: 0x3b2412, alpha: op });

          // Líneas de tablas
          const plankOffsets = [-halfThick * 0.35, halfThick * 0.35];
          for (const po of plankOffsets) {
            this.graphics.moveTo(startX + closedNx * po, startY + closedNy * po);
            this.graphics.lineTo(endX + closedNx * po, endY + closedNy * po);
            this.graphics.stroke({ width: 1, color: 0x5a3818, alpha: 0.8 * op });
          }

          // Tirador embutido
          const hX = startX + closedUx * (doorLength * 0.5);
          const hY = startY + closedUy * (doorLength * 0.5);
          this.graphics.circle(hX, hY, Math.max(2, 0.05 * gSize));
          this.graphics.fill({ color: 0xd4af37, alpha: op });
        }

      } else {
        // Normal: gira desde la bisagra p1
        const currentAngle = closedAngle + (door.openAngle ?? Math.PI / 2) * progress;
        const ux = Math.cos(currentAngle);
        const uy = Math.sin(currentAngle);
        const nx = -uy;
        const ny = ux;

        // Bisagra en p1: pequeño rectángulo oscuro de hierro
        const hingeW = Math.max(4, 0.08 * gSize);
        const hingeH = Math.max(6, 0.14 * gSize);
        const hCorners: Point2D[] = [
          { x: p1.x - ux * (hingeW / 2) - nx * (hingeH / 2), y: p1.y - uy * (hingeW / 2) - ny * (hingeH / 2) },
          { x: p1.x + ux * (hingeW / 2) - nx * (hingeH / 2), y: p1.y + uy * (hingeW / 2) - ny * (hingeH / 2) },
          { x: p1.x + ux * (hingeW / 2) + nx * (hingeH / 2), y: p1.y + uy * (hingeW / 2) + ny * (hingeH / 2) },
          { x: p1.x - ux * (hingeW / 2) + nx * (hingeH / 2), y: p1.y - uy * (hingeW / 2) + ny * (hingeH / 2) }
        ];
        this.graphics.moveTo(hCorners[0].x, hCorners[0].y);
        for (let i = 1; i < hCorners.length; i++) {
          this.graphics.lineTo(hCorners[i].x, hCorners[i].y);
        }
        this.graphics.closePath();
        this.graphics.fill({ color: 0x1e293b, alpha: op });
        this.graphics.stroke({ width: 1, color: 0x090d16, alpha: op });

        // Hoja de la puerta (rectángulo de madera)
        leafCorners = [
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
        this.graphics.fill({ color: 0x8b5a2b, alpha: (door.isOpen ? 0.95 : 1.0) * op });
        this.graphics.stroke({ width: 1.5, color: 0x3b2412, alpha: op });

        // Líneas longitudinales
        const plankOffsets = [-halfThick * 0.35, halfThick * 0.35];
        for (const po of plankOffsets) {
          this.graphics.moveTo(p1.x + nx * po, p1.y + ny * po);
          this.graphics.lineTo(p1.x + ux * doorLength + nx * po, p1.y + uy * doorLength + ny * po);
          this.graphics.stroke({ width: 1, color: 0x5a3818, alpha: 0.8 * op });
        }

        // Pomos dorados
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
      }

      // 6. Resaltado de selección
      if (isSelected && leafCorners.length >= 4) {
        this.graphics.moveTo(leafCorners[0].x, leafCorners[0].y);
        for (let i = 1; i < leafCorners.length; i++) {
          this.graphics.lineTo(leafCorners[i].x, leafCorners[i].y);
        }
        this.graphics.closePath();
        this.graphics.stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
      }

      // 7. Candado / Punto rojo de puerta cerrada con llave (Solo Máster)
      if (this.isMaster && door.isLocked) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const lockR = Math.max(3.5, 0.06 * gSize);

        this.graphics.circle(midX, midY, lockR);
        this.graphics.fill({ color: 0xef4444, alpha: 1 });
        this.graphics.stroke({ width: 1.5, color: 0xffffff, alpha: 1 });
      }
    }

    doorAnimationManager.clean(activeDoorIds);
  }
}
