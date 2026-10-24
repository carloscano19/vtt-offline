import { Container, Graphics } from 'pixi.js';
import { Entity } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';

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

    const mapEntities = entities.filter((e) => e.type === 'map' && e.mapData);

    for (const map of mapEntities) {
      const { mapData, x, y, rotation, scaleX, scaleY } = map;
      if (!mapData) continue;

      const mapPos = { x, y };

      // 1. Dibujar paredes (line_of_sight) en azul cian
      if (mapData.walls && mapData.walls.length > 0) {
        for (const wall of mapData.walls) {
          const w1 = localToWorld(wall.p1, mapPos, rotation, scaleX, scaleY);
          const w2 = localToWorld(wall.p2, mapPos, rotation, scaleX, scaleY);

          this.graphics.moveTo(w1.x, w1.y);
          this.graphics.lineTo(w2.x, w2.y);
        }
        this.graphics.stroke({ width: 3, color: 0x00d2ff, alpha: 0.85 });
      }

      // 2. Dibujar portales (puertas) en naranja
      if (mapData.portals && mapData.portals.length > 0) {
        for (const portal of mapData.portals) {
          const b1 = localToWorld(portal.bounds[0], mapPos, rotation, scaleX, scaleY);
          const b2 = localToWorld(portal.bounds[1], mapPos, rotation, scaleX, scaleY);

          this.graphics.moveTo(b1.x, b1.y);
          this.graphics.lineTo(b2.x, b2.y);
          this.graphics.stroke({ width: 5, color: 0xff9900, alpha: 0.9 });

          // Dibujar punto central del portal
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
  }
}
