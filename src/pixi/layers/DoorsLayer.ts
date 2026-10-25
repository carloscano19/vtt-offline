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

      // 1. Dibujar bisagra (círculo)
      this.graphics.circle(p1.x, p1.y, 4.5);
      this.graphics.fill({ color: door.isLocked ? 0xef4444 : 0xf59e0b });
      this.graphics.stroke({ width: 1.5, color: 0x000000 });

      // 2. Dibujar hoja de la puerta (rectángulo/línea gruesa de madera con biseles)
      const leafColor = door.isLocked ? 0xb91c1c : door.isOpen ? 0x10b981 : 0xd97706;
      this.graphics.moveTo(p1.x, p1.y);
      this.graphics.lineTo(leafEnd.x, leafEnd.y);
      this.graphics.stroke({ width: 5, color: leafColor, alpha: door.isOpen ? 0.8 : 1 });

      // Si está seleccionada o es máster, dibujar detalle
      if (this.isMaster) {
        // En el máster, dibujar icono/indicador central clicable
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        this.graphics.circle(midX, midY, 9);
        this.graphics.fill({ color: 0x0f172a, alpha: 0.85 });
        this.graphics.stroke({ width: 1.5, color: door.isLocked ? 0xef4444 : door.isOpen ? 0x10b981 : 0xf59e0b });

        if (door.isLocked) {
          // Marca de candado (pequeño punto rojo central)
          this.graphics.circle(midX, midY, 3);
          this.graphics.fill({ color: 0xef4444 });
        }
      }
    }
  }
}
