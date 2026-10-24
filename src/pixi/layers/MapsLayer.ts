import { Container, Sprite, Texture } from 'pixi.js';
import { Entity } from '../../types/entity';
import { getTextureForAsset } from '../utils/textureCache';

export class MapsLayer extends Container {
  private isMaster: boolean;
  private spriteMap: Map<string, Sprite> = new Map();

  constructor(isMaster: boolean) {
    super();
    this.isMaster = isMaster;
  }

  public async syncEntities(entities: Entity[]) {
    const mapEntities = entities.filter((e) => e.type === 'map');
    const currentIds = new Set<string>();

    for (const entity of mapEntities) {
      // En la ventana de jugadores, si visibleToPlayers es false, NO se renderiza en absoluto
      if (!this.isMaster && !entity.visibleToPlayers) {
        continue;
      }

      currentIds.add(entity.id);
      let sprite = this.spriteMap.get(entity.id);

      if (!sprite) {
        sprite = new Sprite(Texture.EMPTY);
        sprite.label = entity.id;
        this.spriteMap.set(entity.id, sprite);
        this.addChild(sprite);

        // Carga asíncrona de textura desde IndexedDB
        getTextureForAsset(entity.assetId).then((tex) => {
          if (tex && sprite && !sprite.destroyed) {
            sprite.texture = tex;
          }
        });
      }

      // Actualizar transformaciones
      sprite.x = entity.x;
      sprite.y = entity.y;
      sprite.rotation = entity.rotation;
      sprite.scale.set(entity.scaleX, entity.scaleY);
      sprite.zIndex = entity.zIndex ?? 0;

      // Opacidad según visibilidad para jugadores
      if (this.isMaster) {
        sprite.alpha = entity.visibleToPlayers ? 1.0 : 0.45;
      } else {
        sprite.alpha = 1.0;
      }
    }

    // Eliminar sprites que ya no existan o se hayan ocultado
    for (const [id, sprite] of this.spriteMap.entries()) {
      if (!currentIds.has(id)) {
        this.removeChild(sprite);
        sprite.destroy();
        this.spriteMap.delete(id);
      }
    }
  }

  public getMapSprite(id: string): Sprite | undefined {
    return this.spriteMap.get(id);
  }
}
