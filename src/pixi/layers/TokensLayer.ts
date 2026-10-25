import { Container, Sprite, Graphics, Text, TextStyle, Texture } from 'pixi.js';
import { Entity, TokenSide, Point2D } from '../../types/entity';
import { getTextureForAsset } from '../utils/textureCache';
import { TokenVisibility } from '../../modules/vision/visibilityPolygon';

/**
 * Comprueba si un punto (x, y) está dentro de un polígono 2D (Ray-casting point in polygon)
 */
function isPointInPolygon(point: Point2D, vs: Point2D[]): boolean {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export class TokensLayer extends Container {
  private isMaster: boolean;
  private containerMap: Map<string, Container> = new Map();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public async syncEntities(
    entities: Entity[],
    selectedIds: string[] = [],
    visibilities: TokenVisibility[] = [],
    isPlayerPreview = false,
    fogEnabled = true
  ) {
    const tokenEntities = entities.filter((e) => e.type === 'token' || e.type === 'object');
    const currentIds = new Set<string>();

    const evaluatePlayerVisibility = !this.isMaster || (this.isMaster && isPlayerPreview);

    for (const entity of tokenEntities) {
      if (evaluatePlayerVisibility) {
        // En la ventana de jugadores (o en vista previa de jugadores):
        // 1. Debe tener el ojo abierto (visibleToPlayers = true)
        if (!entity.visibleToPlayers) {
          continue;
        }

        // 2. Si es token de jugador (side === 'jugador'), se ve siempre que tenga el ojo abierto
        // Si es enemigo, neutral u objeto, solo se ve si está dentro de la visión actual
        if (fogEnabled && (entity.side === 'enemigo' || entity.side === 'neutral' || entity.type === 'object')) {
          const pt = { x: entity.x, y: entity.y };
          const isInsideAnyVision = visibilities.some((v) => isPointInPolygon(pt, v.polygon));
          if (!isInsideAnyVision) {
            continue; // No está dentro de la visión actual
          }
        }
      }

      currentIds.add(entity.id);
      let entityContainer = this.containerMap.get(entity.id);

      if (!entityContainer) {
        entityContainer = new Container();
        entityContainer.label = entity.id;
        this.containerMap.set(entity.id, entityContainer);
        this.addChild(entityContainer);

        // Crear Sprite interior
        const sprite = new Sprite(Texture.EMPTY);
        sprite.label = 'sprite';
        sprite.anchor.set(0.5);
        entityContainer.addChild(sprite);

        // Crear Graphics para anillo de bando y selección
        const ring = new Graphics();
        ring.label = 'ring';
        entityContainer.addChild(ring);

        // Crear etiqueta de texto para el nombre
        const nameText = new Text({
          text: entity.name,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            fill: '#ffffff',
            stroke: { color: '#000000', width: 3 },
            align: 'center'
          })
        });
        nameText.label = 'name';
        nameText.anchor.set(0.5, 0);
        entityContainer.addChild(nameText);
      }

      // Carga asíncrona de textura si aún no se ha cargado o si cambió el assetId
      const currentLoadedAssetId = (entityContainer as any)._loadedAssetId;
      const sp = entityContainer.getChildByLabel('sprite') as Sprite;
      if (entity.assetId && sp && (sp.texture === Texture.EMPTY || currentLoadedAssetId !== entity.assetId)) {
        (entityContainer as any)._loadedAssetId = entity.assetId;
        getTextureForAsset(entity.assetId).then((tex) => {
          if (tex && entityContainer && !entityContainer.destroyed) {
            const innerSp = entityContainer.getChildByLabel('sprite') as Sprite;
            if (innerSp) {
              innerSp.texture = tex;
              this.updateEntityVisuals(entityContainer, entity, selectedIds.includes(entity.id));
            }
          }
        });
      }

      // Actualizar transformaciones espaciales en el mundo
      entityContainer.x = entity.x;
      entityContainer.y = entity.y;
      entityContainer.rotation = entity.rotation;
      entityContainer.scale.set(entity.scaleX, entity.scaleY);
      entityContainer.zIndex = entity.zIndex ?? 10;

      // Opacidad según visibilidad para jugadores
      if (this.isMaster && !isPlayerPreview) {
        entityContainer.alpha = entity.visibleToPlayers ? 1.0 : 0.45;
      } else {
        entityContainer.alpha = 1.0;
      }

      this.updateEntityVisuals(entityContainer, entity, selectedIds.includes(entity.id));
    }

    // Eliminar entidades que ya no existan o se hayan ocultado
    for (const [id, container] of this.containerMap.entries()) {
      if (!currentIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.containerMap.delete(id);
      }
    }
  }

  private updateEntityVisuals(container: Container, entity: Entity, isSelected: boolean) {
    const sprite = container.getChildByLabel('sprite') as Sprite;
    const ring = container.getChildByLabel('ring') as Graphics;
    const nameText = container.getChildByLabel('name') as Text;

    if (nameText) {
      nameText.text = entity.name;
    }

    if (!sprite || !ring) return;

    ring.clear();

    const radius = Math.max(25, (sprite.width || 50) / 2);

    // Si es token, dibujar anillo según bando
    if (entity.type === 'token') {
      const sideColor = this.getSideColor(entity.side);
      ring.circle(0, 0, radius + 2);
      ring.stroke({ width: 3, color: sideColor, alpha: 0.9 });
    }

    // Indicador visual de selección en máster
    if (this.isMaster && isSelected) {
      ring.circle(0, 0, radius + 6);
      ring.stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
    }

    // Indicador visual de candado (bloqueado) o de oculto en máster
    if (this.isMaster) {
      if (entity.locked) {
        ring.circle(radius - 5, -radius + 5, 5);
        ring.fill({ color: 0xff4444, alpha: 1.0 });
        ring.stroke({ width: 1, color: 0x000000 });
      }
      if (!entity.visibleToPlayers) {
        ring.circle(0, 0, radius + 1);
        ring.stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.7 });
      }
      if (entity.side === 'jugador' && entity.vision?.active) {
        // Indicador de visión activa (pequeño halo/ojo cyan)
        ring.circle(-radius + 5, -radius + 5, 4);
        ring.fill({ color: 0x38bdf8 });
        ring.stroke({ width: 1, color: 0x0284c7 });
      }
    }

    if (nameText) {
      nameText.y = radius + 6;
      nameText.visible = entity.type === 'token';
    }
  }

  private getSideColor(side?: TokenSide): number {
    switch (side) {
      case 'enemigo':
        return 0xef4444; // Rojo
      case 'neutral':
        return 0xeab308; // Amarillo
      case 'jugador':
      default:
        return 0x10b981; // Verde esmeralda
    }
  }

  public getEntityBounds(entityId: string): { width: number; height: number; radius: number } | null {
    const container = this.containerMap.get(entityId);
    if (!container) return null;
    const sprite = container.getChildByLabel('sprite') as Sprite;
    if (!sprite) return null;

    const w = sprite.width || 70;
    const h = sprite.height || 70;
    return {
      width: w,
      height: h,
      radius: Math.max(w, h) / 2
    };
  }
}
