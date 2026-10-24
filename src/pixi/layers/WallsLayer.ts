import { Container, Graphics } from 'pixi.js';
import { Entity, Point2D } from '../../types/entity';
import { localToWorld } from '../utils/coordinates';

export class WallsLayer extends Container {
  private graphics: Graphics;
  private isMaster: boolean;

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public update(entities: Entity[], selectedIds: string[] = [], activeDraftPoints: Point2D[] = []) {
    this.graphics.clear();

    // Las paredes invisibles NUNCA se muestran en la ventana de jugadores
    if (!this.isMaster) {
      return;
    }

    const mapEntitiesById = new Map<string, Entity>();
    for (const ent of entities) {
      if (ent.type === 'map') {
        mapEntitiesById.set(ent.id, ent);
      }
    }

    const wallEntities = entities.filter((e) => e.type === 'wall' && e.points && e.points.length > 0);

    for (const wall of wallEntities) {
      const isSelected = selectedIds.includes(wall.id);
      const pts = wall.points!;
      if (pts.length === 0) continue;

      const parentMap = wall.mapId ? mapEntitiesById.get(wall.mapId) : undefined;
      const transformPoint = (p: Point2D): Point2D => {
        if (parentMap) {
          const mapPos = { x: parentMap.x, y: parentMap.y };
          return localToWorld(p, mapPos, parentMap.rotation, parentMap.scaleX, parentMap.scaleY);
        }
        return p;
      };

      const worldPts = pts.map(transformPoint);

      // Dibujar líneas de pared (rojo brillante si seleccionada, rojo intenso translúcido si normal)
      const lineColor = isSelected ? 0xff4444 : 0xef4444;
      const lineWidth = isSelected ? 3.5 : 2.5;
      const lineAlpha = isSelected ? 1.0 : 0.8;

      this.graphics.moveTo(worldPts[0].x, worldPts[0].y);
      for (let i = 1; i < worldPts.length; i++) {
        this.graphics.lineTo(worldPts[i].x, worldPts[i].y);
      }
      if (wall.closed && worldPts.length > 2) {
        this.graphics.lineTo(worldPts[0].x, worldPts[0].y);
      }
      this.graphics.stroke({ width: lineWidth, color: lineColor, alpha: lineAlpha });

      // Dibujar nodos de pared
      for (const p of worldPts) {
        this.graphics.circle(p.x, p.y, isSelected ? 5.5 : 4);
        this.graphics.fill({ color: isSelected ? 0xffffff : 0xff4444 });
        this.graphics.stroke({ width: 1.5, color: isSelected ? 0xef4444 : 0x000000 });
      }
    }

    // Dibujar pared en curso de dibujo (draft)
    if (activeDraftPoints.length > 0) {
      this.graphics.moveTo(activeDraftPoints[0].x, activeDraftPoints[0].y);
      for (let i = 1; i < activeDraftPoints.length; i++) {
        this.graphics.lineTo(activeDraftPoints[i].x, activeDraftPoints[i].y);
      }
      this.graphics.stroke({ width: 2.5, color: 0xff3333, alpha: 0.9 });

      for (const p of activeDraftPoints) {
        this.graphics.circle(p.x, p.y, 4.5);
        this.graphics.fill({ color: 0xffffff });
        this.graphics.stroke({ width: 1.5, color: 0xff0000 });
      }
    }
  }
}
