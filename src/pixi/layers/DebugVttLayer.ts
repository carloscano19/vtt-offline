import { Container, Graphics } from 'pixi.js';
import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';
import { getAllWallSegments } from '../../modules/walls/wallManager';

export class DebugVttLayer extends Container {
  private graphics: Graphics;
  private isMaster: boolean;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public update(entities: Entity[], showOverlay: boolean) {
    this.graphics.clear();

    // Solo se muestra en la ventana máster y si el overlay está activado
    if (!this.isMaster || !showOverlay) {
      return;
    }

    const allSegments = getAllWallSegments(entities);

    // 1. Dibujar todos los segmentos de pared activos (UVTT, dibujadas, puertas cerradas) en azul cian
    if (allSegments.length > 0) {
      for (const seg of allSegments) {
        this.graphics.moveTo(seg.p1.x, seg.p1.y);
        this.graphics.lineTo(seg.p2.x, seg.p2.y);
      }
      this.graphics.stroke({ width: 3, color: 0x00d2ff, alpha: 0.85 });
    }

    // 2. Dibujar portales y puertas
    // a) Portales y luces de mapas UVTT
    const mapEntities = entities.filter((e) => e.type === 'map' && e.mapData);
    for (const map of mapEntities) {
      const { mapData, x, y, rotation, scaleX, scaleY } = map;
      if (!mapData) continue;
      const mapPos = { x, y };

      if (mapData.portals && mapData.portals.length > 0) {
        for (const portal of mapData.portals) {
          const b1 = localToWorld(portal.bounds[0], mapPos, rotation, scaleX, scaleY);
          const b2 = localToWorld(portal.bounds[1], mapPos, rotation, scaleX, scaleY);

          this.graphics.moveTo(b1.x, b1.y);
          this.graphics.lineTo(b2.x, b2.y);
          this.graphics.stroke({ width: 5, color: 0xff9900, alpha: 0.9 });

          const center = localToWorld(portal.position, mapPos, rotation, scaleX, scaleY);
          this.graphics.circle(center.x, center.y, 4);
          this.graphics.fill({ color: 0xffcc00, alpha: 1.0 });
        }
      }

      // 3. Dibujar luces en amarillo dorado con radio
      if (mapData.lights && mapData.lights.length > 0) {
        for (const light of mapData.lights) {
          const center = localToWorld(light.position, mapPos, rotation, scaleX, scaleY);
          const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
          const worldRange = light.range * avgScale;

          // Círculo de alcance
          this.graphics.circle(center.x, center.y, worldRange);
          this.graphics.stroke({ width: 1.5, color: 0xffdd44, alpha: 0.4 });
          this.graphics.fill({ color: 0xffea00, alpha: 0.08 });

          // Punto central de luz
          this.graphics.circle(center.x, center.y, 5);
          this.graphics.fill({ color: 0xffea00, alpha: 0.9 });
        }
      }
    }

    // b) Entidades de puerta independientes
    const mapEntitiesById = new Map<string, Entity>();
    for (const ent of entities) {
      if (ent.type === 'map') {
        mapEntitiesById.set(ent.id, ent);
      }
    }

    const doorEntities = entities.filter((e) => e.type === 'door' && e.door);
    for (const d of doorEntities) {
      const parentMap = d.mapId ? mapEntitiesById.get(d.mapId) : undefined;
      const transformPoint = (p: Point2D): Point2D => {
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(p, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
        return p;
      };

      const p1 = transformPoint(d.door!.p1);
      const p2 = transformPoint(d.door!.p2);
      this.graphics.moveTo(p1.x, p1.y);
      this.graphics.lineTo(p2.x, p2.y);
      this.graphics.stroke({ width: 5, color: d.door!.isOpen ? 0x22c55e : 0xff9900, alpha: 0.9 });

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      this.graphics.circle(midX, midY, 4);
      this.graphics.fill({ color: d.door!.isOpen ? 0x4ade80 : 0xffcc00, alpha: 1.0 });
    }
  }
}
