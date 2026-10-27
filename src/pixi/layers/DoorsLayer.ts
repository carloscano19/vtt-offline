import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';

export class DoorsLayer extends Container {
  private graphics: Graphics;
  private isMaster: boolean;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  private draftP1: Point2D | null = null;
  private draftP2: Point2D | null = null;

  public setDraftDoor(p1: Point2D | null, p2: Point2D | null) {
    this.draftP1 = p1;
    this.draftP2 = p2;
  }

  public update(entities: Entity[], selectedIds: string[] = []) {
    this.graphics.clear();

    const mapEntitiesById = new Map<string, Entity>();
    for (const ent of entities) {
      if (ent.type === 'map') {
        mapEntitiesById.set(ent.id, ent);
      }
    }

    const doorEntities = entities.filter((e) => e.type === 'door' && e.door);

    for (const ent of doorEntities) {
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

      const doorLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const closedAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      // Si está abierta, gira 90 grados respecto a la bisagra p1
      const currentAngle = door.isOpen ? closedAngle + (door.openAngle ?? Math.PI / 2) : closedAngle;

      const leafEnd: Point2D = {
        x: p1.x + Math.cos(currentAngle) * doorLength,
        y: p1.y + Math.sin(currentAngle) * doorLength
      };

      // Si está seleccionada, dibujar línea de referencia cerrada tenue si está abierta
      if (isSelected && this.isMaster && door.isOpen) {
        this.graphics.moveTo(p1.x, p1.y);
        this.graphics.lineTo(p2.x, p2.y);
        this.graphics.stroke({ width: 2, color: 0x38bdf8, alpha: 0.4 });
      }

      // 1. Dibujar bisagra (círculo)
      this.graphics.circle(p1.x, p1.y, 5);
      this.graphics.fill({ color: door.isLocked ? 0xef4444 : 0xf59e0b });
      this.graphics.stroke({ width: 1.5, color: 0x000000 });

      // 2. Dibujar hoja de la puerta (línea sólida de madera)
      const leafColor = door.isLocked ? 0xb91c1c : door.isOpen ? 0x10b981 : 0xd97706;
      this.graphics.moveTo(p1.x, p1.y);
      this.graphics.lineTo(leafEnd.x, leafEnd.y);
      this.graphics.stroke({ width: 6, color: leafColor, alpha: door.isOpen ? 0.85 : 1 });

      // 3. Marcadores y Manijas (solo Máster)
      if (this.isMaster) {
        // Marcador visual no interactivo de la bisagra en p1
        this.graphics.circle(p1.x, p1.y, 3.5);
        this.graphics.fill({ color: 0x0f172a });
        this.graphics.stroke({ width: 1.5, color: door.isOpen ? 0x10b981 : 0xf59e0b });

        // Si está bloqueada con candado, pequeño indicador visual sobre la hoja
        if (door.isLocked) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          this.graphics.circle(midX, midY, 4);
          this.graphics.fill({ color: 0xef4444 });
          this.graphics.stroke({ width: 1.5, color: 0xffffff });
        }

        // Si la puerta está seleccionada: EXACTAMENTE DOS manijas (una en cada extremo)
        if (isSelected) {
          // Manija extremo p1 (bisagra / redimensionar y mover extremo)
          this.graphics.circle(p1.x, p1.y, 9);
          this.graphics.fill({ color: 0x0284c7 });
          this.graphics.stroke({ width: 2.5, color: 0xffffff });
          this.graphics.circle(p1.x, p1.y, 3);
          this.graphics.fill({ color: 0xffffff });

          // Manija extremo p2 (extremo libre / redimensionar y rotar)
          this.graphics.circle(p2.x, p2.y, 9);
          this.graphics.fill({ color: 0x0284c7 });
          this.graphics.stroke({ width: 2.5, color: 0xffffff });
          this.graphics.circle(p2.x, p2.y, 3);
          this.graphics.fill({ color: 0xffffff });
        }
      }
    }

    // 4. Dibujar borrador de puerta en progreso (solo Máster)
    if (this.isMaster && this.draftP1 && this.draftP2) {
      this.graphics.moveTo(this.draftP1.x, this.draftP1.y);
      this.graphics.lineTo(this.draftP2.x, this.draftP2.y);
      this.graphics.stroke({ width: 4, color: 0xf59e0b, alpha: 0.75 });

      // Círculo bisagra p1
      this.graphics.circle(this.draftP1.x, this.draftP1.y, 6);
      this.graphics.fill({ color: 0xf59e0b });
      this.graphics.stroke({ width: 2, color: 0xffffff });

      // Círculo extremo p2
      this.graphics.circle(this.draftP2.x, this.draftP2.y, 6);
      this.graphics.fill({ color: 0x38bdf8 });
      this.graphics.stroke({ width: 2, color: 0xffffff });
    }
  }
}
